// Iniciar servidor local + túnel público seguro con Ngrok
var ngrok = require('@ngrok/ngrok');
var TOKEN = '3LKhT6y6ZlB47bPLKJk1Nrxk09U_3f9oqGo1xqTWG5QVTrY5X';

// 1. Iniciar servidor principal de la agenda (si no estaba corriendo ya)
try {
  require('./server.js');
} catch (e) {
  if (e.code === 'EADDRINUSE') {
    console.log('[Aviso: El servidor de la agenda ya estaba abierto en el puerto 8080. Continuando...]');
  } else {
    throw e;
  }
}

// 2. Conectar túnel con el authtoken
(async function() {
  try {
    console.log('\n[Conectando con Ngrok a internet...]');
    var listener = await ngrok.forward({
      addr: 8080,
      authtoken: TOKEN
    });

    console.log('\n=============================================================');
    console.log('       AGENDA CONECTADA Y ACCESIBLE DESDE CUALQUIER LUGAR    ');
    console.log('=============================================================');
    console.log('\n>> Tu enlace publico seguro (HTTPS) es:');
    console.log('\n   ' + listener.url());
    console.log('\n>> Comparti ese link con tu equipo para que entren desde');
    console.log('   sus celulares o computadoras desde cualquier lado.');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('\nError al conectar el túnel de Ngrok:', err.message || err);
  }
})();
