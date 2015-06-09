var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);


/*	Variables globales del juego */
var gm = 0;
var sockets = {0:new function(){this.emit=function(){console.log("socket fantasma")}}};

/*	---------------------------- */

//File handler//
app.use('/', express.static('public'));

//server//
var port = 80;
http.listen(port, function(){
  console.log('listening on *:'+port);
});

var Jugadores = function() {
	
	this.jugadores = {};
	this.socket2name = {};

	this.add = function(name, socket) {
		this.jugadores[name] = {"socket":socket, "active":1};
  		this.socket2name[socket.id] = name;		
  		socket.emit("ingresado");
  		sockets[gm].emit("newplayer", name);
	}

	this.reconnect = function(name, newsocket) {
		if(name in this.jugadores){
			var oldsock = this.jugadores[name]['socket'];
			this.jugadores[name]['socket'] = newsocket;
			this.jugadores[name]['active'] = 1;
			if(oldsock.id in this.socket2name){
				delete(this.socket2name[oldsock.id]);
			}
		}else{
			this.jugadores[name] = {"socket":newsocket, "active":1};
		}
		this.socket2name[newsocket.id] = name;
		sockets[gm].emit("newplayer", name);
		newsocket.emit("ingresado");
	}

	this.disconnect = function(socket) {
		if(socket.id in this.socket2name){
			var name = this.socket2name[socket.id];
			this.jugadores[name]["active"] = 0;
			delete(this.socket2name[socket.id]);
			sockets[gm].emit("delplayer", name);
		}
	}

	this.broadcast = function(list, vars) {
		for(jugador in this.jugadores){
			if(this.jugadores[jugador]["active"]==1){
				this.jugadores[jugador]["socket"].emit(list, vars);
			}
		}
	}

}

var Juego = function() {
	
	this.escenario = {	1:0,
						2:0,
						3:0,
						4:0}
	this.target = 0;
	this.winner = [];

	this.start = function() {
		var disponibles = [0,1,2,3,4];
		this.winner = [];
		this.target = 0;

		for(var i = 1 ; i<=4;i++){
			//random del tamaño de disp
			var tam = disponibles.length;

			var r = Math.floor(Math.random()*tam);
			//elegir y sacar

			this.escenario[i] = disponibles[r];
			disponibles.splice(r,1);
			//repetir
		}

		//elegir uno de escenario
		var r = Math.floor(Math.random()*4+1);
		this.target = this.escenario[r];
		return this.escenario;
	}

	this.play = function(jugador, jugada, socket) {
		if(jugada==this.target){
			if(this.winner.length==0){
				this.winner = [jugador];
				sockets[gm].emit("winner",jugador);
				socket.emit("winner");
			}else{
				this.winner.push(jugador);
				var lugar = this.winner.length;
				sockets[gm].emit("winner2",[jugador, lugar]);
				socket.emit("winner2", lugar);
			}
		}else{
			socket.emit("loser");
		}
	}

}

var j = new Jugadores;
var game = new Juego;

io.on('connection', function(socket){
  console.log('->socket open');

  sockets[socket.id] = socket;

  //GM//

  socket.on("setgm",function() {

  	gm = socket.id
  	console.log('->new GM');
  	for(jugador in j.jugadores){
  		if(j.jugadores[jugador]['active']==1){
  			if(j.jugadores[jugador]['socket'].connected==true){
  				socket.emit("newplayer", jugador);	
  			}else{
  				j.jugadores[jugador]['active']=0;
  			}
  		}
  	}
  })

  socket.on("startgame",function() {

  	console.log('->START GAME');
  	var secs = 5;

  	var I = function() { 
  		setTimeout(function() {
	  		secs--;
	  		if(secs>0){
	  			j.broadcast("time",secs);
	  			sockets[gm].emit("time",secs);
	  			I();
	  		}else{

	  			var esc = game.start();
	  			j.broadcast("start",esc);
	  			sockets[gm].emit("start",game.target);
	  		}
	  	},1000);
  	};

  	I()

  })

  //jugadores///

  //por si se desconecta a mitad de juego
  socket.emit("requestid");
  socket.on('setid', function(jugador){
    j.reconnect(jugador, socket);
    console.log('->player reconnect');		
  });

  socket.on('disconnect', function(){
    console.log('->socket closed');
    console.log(socket.id);
    j.disconnect(socket);
  });

  socket.on("ingresar", function(nombre) {
  	if(nombre in j.jugadores){
  		if(j.jugadores[nombre]['active']==0){
  			j.reconnect(nombre,socket);
  			console.log('->player reconnect');
  		}else{
  			if(j.jugadores[nombre]['socket'].connected==true){
  				socket.emit("jugador-error","Jugador ya existe");
  				console.log('->player no login');
  			}else{
  				j.jugadores[nombre]['active']=0;
  				j.reconnect(nombre,socket);
  				console.log('->player reconnect');
  			}
  		}
  	}else{
  		//registrar
  		console.log('->player connect');
  		j.add(nombre,socket);
  	}
  })

  socket.on("jugada",function(data) {
  	console.log('->player JUGADA');
  	var jugador = data[1];
  	var jugada = data[0];
  	game.play(jugador,jugada,socket);
  })


});