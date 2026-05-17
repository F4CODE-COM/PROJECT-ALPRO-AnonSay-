#include <iostream>
#include <conio.h>
using namespace std;

int main(){
    string menu_homepage[]{
        "VOTING",
        "FORUM"
    };
    int pilihan = 0, menu = 2;

    cout << "________________________________________________\n";
    cout << "SELAMAT DATANG DI AnonSay, mau ngapain hari ini?\n";

    while(true){
        system("cls");
        for (int i = 0; i < menu; i++) {
            if (i == pilihan)
                cout << ">> ";
            else
                cout << "   ";

            cout << menu_homepage[i] << endl;
        }

        int ch = _getch();
        if (ch == 224) {
            ch = _getch();

            if (ch == 72) { // atas
                pilihan--;

                if (pilihan < 0)
                    pilihan = menu - 1;
            }
            else if (ch == 80) { // bawah
                pilihan++;

                if (pilihan >= menu)
                    pilihan = 0;
            }
        }
        else if (ch == 13) { // Enter
            break;
        }
    }

    cout << "you chose: " << menu_homepage[pilihan];

}
