// Membuat variabel bernama display
// document = objek bawaan JavaScript untuk mengakses HTML
// getElementById("display") = mengambil elemen HTML yang memiliki id="display" (di bagian <input type="text" id="display" disabled>)
const display = document.getElementById("display");


// Function untuk menambahkan angka/operator ke display biar angkanya muncul di layar kalo di klik
// value = parameter (data yang dikirim saat function dipanggil)
function add(value) {

  // display.value = isi dari input
  // += berarti menambahkan isi baru ke isi lama
  // contoh: "12" + "3" menjadi "123"
    display.value += value;
}


// Function untuk menghapus isi display kalo di tampilan web kalkulator yang huruf "C"
function clearDisplay() {

  // Mengosongkan value/input
    display.value = "";
}


// Function untuk menghitung operasi matematika
function calculate() {

  // try digunakan untuk mencoba menjalankan kode
  // Jika ada error, program tidak langsung berhenti
    try {

    // eval() digunakan untuk menghitung string matematika, jadi kayak fungsi otomatis gaperlu pake a+b dll. 
    // contoh: "2+3*4" akan dihitung menjadi 14
    display.value = eval(display.value);

  // catch akan berjalan jika terjadi error
  // misalnya input tidak valid seperti "2++"
    } catch {

    // Menampilkan tulisan Error jika perhitungan gagal
    display.value = "Error";
    }
}