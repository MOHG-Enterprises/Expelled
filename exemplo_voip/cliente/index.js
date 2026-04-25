// import config from './config.js'
// import abertura from './abertura.js'
// import sala from './cena-sala.js'

// class Game extends Phaser.Game {
//   constructor () {
//     super(config)

//     let iceServers
//     this.socket = io()

//     iceServers = [
//       {
//         urls: 'stun:stun.l.google.com:19302'
//       }
//      ]

//     this.ice_servers = { iceServers }
//     this.audio = document.querySelector('audio')

//     this.socket.on('connect', () => {
//       console.log('Conectado ao servidor para troca de mensagens.')
//     })

//     this.scene.add('abertura', abertura)
//     this.scene.add('sala', sala)

//     this.scene.start('abertura')
//   }
// }

// window.onload = () => {
//   window.game = new Game()
// }