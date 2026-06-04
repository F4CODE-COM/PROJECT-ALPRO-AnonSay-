// ============================================================
//  AnonSay Backend — Drogon C++ Framework
//  Semua data in-memory (tidak ada database).
//  Data akan hilang saat server restart (sesuai spesifikasi).
//
//  Compile:
//    mkdir build && cd build
//    cmake .. && make -j4
//
//  Run:
//    ./anonsay
//  Server akan berjalan di http://localhost:8080
// ============================================================

#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <drogon/drogon.h>
#include <drogon/HttpController.h>
#include <json/json.h>
#include <mutex>
#include <unordered_map>
#include <vector>
#include <string>
#include <chrono>
#include <algorithm>

using namespace drogon;
using namespace std::chrono;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DATA STRUCTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct VoteItem {
    std::string label;
    int votes{0};
};

struct FessMessage {
    std::string text;
    std::string sender;
    long long ts{0};
};

struct ForumPost {
    std::string id;
    std::string text;
    std::string sender;
    int score{0};
    long long ts{0};
};

struct Room {
    std::string code;
    std::string feature;   // "anonvote" | "anonfess" | "anonforum"
    std::string desc;
    long long expiresAt{0};
    bool closed{false};
    bool showEarlyResult{false};

    // AnonVote
    std::vector<VoteItem> items;
    std::unordered_map<std::string, int> votesCast; // "sessionId" -> itemIndex

    // AnonFess
    std::vector<FessMessage> messages;

    // AnonForum
    std::vector<ForumPost> posts;
};

// In-memory store: feature -> code -> Room
std::mutex g_mutex;
std::unordered_map<std::string,
    std::unordered_map<std::string, Room>> g_rooms;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

long long nowMs() {
    return duration_cast<milliseconds>(
        system_clock::now().time_since_epoch()).count();
}

bool roomExpired(const Room& r) {
    return r.closed || nowMs() >= r.expiresAt;
}

Json::Value roomToJson(const Room& r, bool adminView) {
    Json::Value j;
    j["code"]    = r.code;
    j["feature"] = r.feature;
    j["desc"]    = r.desc;
    j["expiresAt"] = (Json::Int64)r.expiresAt;
    j["closed"]  = roomExpired(r);
    j["showEarlyResult"] = r.showEarlyResult;

    if (r.feature == "anonvote") {
        Json::Value items(Json::arrayValue);
        for (auto& it : r.items) {
            Json::Value item;
            item["label"] = it.label;
            item["votes"] = it.votes;
            items.append(item);
        }
        j["items"] = items;
    } else if (r.feature == "anonfess") {
        if (adminView) {
            Json::Value msgs(Json::arrayValue);
            for (auto& m : r.messages) {
                Json::Value msg;
                msg["text"]   = m.text;
                msg["sender"] = m.sender;
                msg["ts"]     = (Json::Int64)m.ts;
                msgs.append(msg);
            }
            j["messages"] = msgs;
        }
    } else if (r.feature == "anonforum") {
        Json::Value posts(Json::arrayValue);
        for (auto& p : r.posts) {
            Json::Value post;
            post["id"]     = p.id;
            post["text"]   = p.text;
            post["sender"] = p.sender;
            post["score"]  = p.score;
            post["ts"]     = (Json::Int64)p.ts;
            posts.append(post);
        }
        j["posts"] = posts;
    }
    return j;
}

HttpResponsePtr jsonResp(const Json::Value& v, HttpStatusCode code = k200OK) {
    auto resp = HttpResponse::newHttpJsonResponse(v);
    resp->setStatusCode(code);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    resp->addHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    resp->addHeader("Access-Control-Allow-Headers", "Content-Type");
    return resp;
}

HttpResponsePtr errResp(const std::string& msg, HttpStatusCode code = k400BadRequest) {
    Json::Value j;
    j["error"] = msg;
    return jsonResp(j, code);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CONTROLLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AnonSayCtrl : public HttpController<AnonSayCtrl> {
public:
    METHOD_LIST_BEGIN
        // CORS preflight
        ADD_METHOD_TO(AnonSayCtrl::cors,    "/api/.*",       Options);
        // Room CRUD
        ADD_METHOD_TO(AnonSayCtrl::createRoom,  "/api/room",             Post);
        ADD_METHOD_TO(AnonSayCtrl::getRoom,     "/api/room/{feature}/{code}", Get);
        // Updates (polling)
        ADD_METHOD_TO(AnonSayCtrl::getUpdates,  "/api/updates/{feature}/{code}", Get);
        // AnonVote
        ADD_METHOD_TO(AnonSayCtrl::castVote,    "/api/vote",             Post);
        ADD_METHOD_TO(AnonSayCtrl::closeVote,   "/api/vote/close",       Post);
        // AnonFess
        ADD_METHOD_TO(AnonSayCtrl::sendFess,    "/api/fess",             Post);
        // AnonForum
        ADD_METHOD_TO(AnonSayCtrl::sendForumPost, "/api/forum/post",     Post);
        ADD_METHOD_TO(AnonSayCtrl::voteForumPost, "/api/forum/vote",     Post);
    METHOD_LIST_END

    // ── CORS ──────────────────────────────────────
    void cors(const HttpRequestPtr&, std::function<void(const HttpResponsePtr&)>&& cb) {
        Json::Value j; j["ok"] = true;
        cb(jsonResp(j));
    }

    // ── CREATE ROOM ───────────────────────────────
    void createRoom(const HttpRequestPtr& req,
                    std::function<void(const HttpResponsePtr&)>&& cb)
    {
        auto body = req->getJsonObject();
        if (!body) { cb(errResp("Invalid JSON")); return; }

        std::string feature = (*body)["feature"].asString();
        std::string code    = (*body)["code"].asString();
        if (code.size() != 5 || feature.empty()) {
            cb(errResp("code must be 5 chars, feature required")); return;
        }
        // Normalise
        for (auto& c : code) c = toupper(c);

        Room r;
        r.code    = code;
        r.feature = feature;
        r.desc    = (*body)["desc"].asString();
        r.expiresAt = (*body)["expiresAt"].asInt64();
        r.showEarlyResult = (*body).get("showEarlyResult", false).asBool();

        if (feature == "anonvote") {
            for (auto& it : (*body)["items"]) {
                VoteItem vi;
                vi.label = it["label"].asString();
                vi.votes = 0;
                r.items.push_back(vi);
            }
        }

        {
            std::lock_guard<std::mutex> lk(g_mutex);
            g_rooms[feature][code] = std::move(r);
        }

        Json::Value resp; resp["ok"] = true; resp["code"] = code;
        cb(jsonResp(resp));
    }

    // ── GET ROOM ──────────────────────────────────
    void getRoom(const HttpRequestPtr& req,
                 std::function<void(const HttpResponsePtr&)>&& cb,
                 std::string feature, std::string code)
    {
        for (auto& c : code) c = toupper(c);
        std::lock_guard<std::mutex> lk(g_mutex);
        auto fit = g_rooms.find(feature);
        if (fit == g_rooms.end()) { cb(errResp("Not found", k404NotFound)); return; }
        auto rit = fit->second.find(code);
        if (rit == fit->second.end()) { cb(errResp("Not found", k404NotFound)); return; }
        cb(jsonResp(roomToJson(rit->second, false)));
    }

    // ── GET UPDATES (polling) ─────────────────────
    void getUpdates(const HttpRequestPtr& req,
                    std::function<void(const HttpResponsePtr&)>&& cb,
                    std::string feature, std::string code)
    {
        for (auto& c : code) c = toupper(c);
        std::lock_guard<std::mutex> lk(g_mutex);
        auto fit = g_rooms.find(feature);
        if (fit == g_rooms.end()) { cb(errResp("Not found", k404NotFound)); return; }
        auto rit = fit->second.find(code);
        if (rit == fit->second.end()) { cb(errResp("Not found", k404NotFound)); return; }
        auto& r = rit->second;
        bool expired = roomExpired(r);
        if (expired) r.closed = true;
        cb(jsonResp(roomToJson(r, true)));
    }

    // ── CAST VOTE ─────────────────────────────────
    void castVote(const HttpRequestPtr& req,
                  std::function<void(const HttpResponsePtr&)>&& cb)
    {
        auto body = req->getJsonObject();
        if (!body) { cb(errResp("Invalid JSON")); return; }
        std::string code = (*body)["code"].asString();
        for (auto& c : code) c = toupper(c);
        int idx = (*body)["itemIndex"].asInt();
        // Use IP as simple session identifier
        std::string session = req->getPeerAddr().toIp();

        std::lock_guard<std::mutex> lk(g_mutex);
        auto& rooms = g_rooms["anonvote"];
        auto rit = rooms.find(code);
        if (rit == rooms.end()) { cb(errResp("Room not found", k404NotFound)); return; }
        auto& r = rit->second;
        if (roomExpired(r)) { cb(errResp("Room expired")); return; }
        if (idx < 0 || idx >= (int)r.items.size()) { cb(errResp("Invalid item index")); return; }
        if (r.votesCast.count(session)) { cb(errResp("Already voted")); return; }
        r.votesCast[session] = idx;
        r.items[idx].votes++;
        Json::Value resp; resp["ok"] = true;
        cb(jsonResp(resp));
    }

    // ── CLOSE VOTE EARLY ─────────────────────────
    void closeVote(const HttpRequestPtr& req,
                   std::function<void(const HttpResponsePtr&)>&& cb)
    {
        auto body = req->getJsonObject();
        if (!body) { cb(errResp("Invalid JSON")); return; }
        std::string code = (*body)["code"].asString();
        for (auto& c : code) c = toupper(c);

        std::lock_guard<std::mutex> lk(g_mutex);
        auto rit = g_rooms["anonvote"].find(code);
        if (rit == g_rooms["anonvote"].end()) { cb(errResp("Not found", k404NotFound)); return; }
        rit->second.closed = true;
        Json::Value resp; resp["ok"] = true;
        cb(jsonResp(resp));
    }

    // ── SEND FESS ────────────────────────────────
    void sendFess(const HttpRequestPtr& req,
                  std::function<void(const HttpResponsePtr&)>&& cb)
    {
        auto body = req->getJsonObject();
        if (!body) { cb(errResp("Invalid JSON")); return; }
        std::string code = (*body)["code"].asString();
        for (auto& c : code) c = toupper(c);

        std::lock_guard<std::mutex> lk(g_mutex);
        auto rit = g_rooms["anonfess"].find(code);
        if (rit == g_rooms["anonfess"].end()) { cb(errResp("Room not found", k404NotFound)); return; }
        auto& r = rit->second;
        if (roomExpired(r)) { cb(errResp("Room expired")); return; }
        FessMessage m;
        m.text   = (*body)["text"].asString();
        m.sender = (*body)["sender"].asString();
        m.ts     = (*body)["ts"].asInt64();
        r.messages.push_back(m);
        Json::Value resp; resp["ok"] = true;
        cb(jsonResp(resp));
    }

    // ── SEND FORUM POST ───────────────────────────
    void sendForumPost(const HttpRequestPtr& req,
                       std::function<void(const HttpResponsePtr&)>&& cb)
    {
        auto body = req->getJsonObject();
        if (!body) { cb(errResp("Invalid JSON")); return; }
        std::string code = (*body)["code"].asString();
        for (auto& c : code) c = toupper(c);

        std::lock_guard<std::mutex> lk(g_mutex);
        auto rit = g_rooms["anonforum"].find(code);
        if (rit == g_rooms["anonforum"].end()) { cb(errResp("Room not found", k404NotFound)); return; }
        auto& r = rit->second;
        if (roomExpired(r)) { cb(errResp("Room expired")); return; }
        ForumPost p;
        p.id     = (*body)["id"].asString();
        p.text   = (*body)["text"].asString();
        p.sender = (*body)["sender"].asString();
        p.score  = 0;
        p.ts     = (*body)["ts"].asInt64();
        r.posts.push_back(p);
        Json::Value resp; resp["ok"] = true;
        cb(jsonResp(resp));
    }

    // ── VOTE FORUM POST ───────────────────────────
    void voteForumPost(const HttpRequestPtr& req,
                       std::function<void(const HttpResponsePtr&)>&& cb)
    {
        auto body = req->getJsonObject();
        if (!body) { cb(errResp("Invalid JSON")); return; }
        std::string code   = (*body)["code"].asString();
        std::string postId = (*body)["postId"].asString();
        int val            = (*body)["val"].asInt(); // +1 or -1
        for (auto& c : code) c = toupper(c);

        std::lock_guard<std::mutex> lk(g_mutex);
        auto rit = g_rooms["anonforum"].find(code);
        if (rit == g_rooms["anonforum"].end()) { cb(errResp("Room not found", k404NotFound)); return; }
        auto& r = rit->second;
        for (auto& p : r.posts) {
            if (p.id == postId) {
                int ns = p.score + val;
if (ns > 9999) ns = 9999;
if (ns < -999) ns = -999;
p.score = ns;
                break;
            }
        }
        Json::Value resp; resp["ok"] = true;
        cb(jsonResp(resp));
    }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
int main() {
    app().setLogPath("./")
         .setLogLevel(trantor::Logger::kWarn)
         .addListener("0.0.0.0", 8080)
         .setThreadNum(4)
         .enableServerHeader(false)
         .run();
    return 0;
}
