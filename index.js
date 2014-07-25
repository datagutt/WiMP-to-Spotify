var SpotifyWebApi = require('spotify-web-api-node');
var WiMP = require('wimp-api');
var _ = require('lodash');
var wimpUsername = process.env.UN;
var wimpPassword = process.env.PW;
var config = require('./config');

var spotifyApi = new SpotifyWebApi({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
  redirectUri: 'http://spotify.datagutt1.com/callback'
});
var auth = function(authCode, fn){
	spotifyApi.authorizationCodeGrant(authCode)
	.then(function(data){
		console.log('The token expires in ' + data['expires_in']);
		console.log('The access token is ' + data['access_token']);
		console.log('The refresh token is ' + data['refresh_token']);
		
		// Set the access token on the API object to use it in later calls
		spotifyApi.setAccessToken(data['access_token']);
		spotifyApi.setRefreshToken(data['refresh_token']);
		if(fn){
			fn(null);
		}
	 }, fn);
};

var getWimpPlaylist = function getWimpPlaylist(fn){
	var playlistTracks = [];
	WiMP.login(wimpUsername, wimpPassword, function(err, wimp){
		wimp.getPlaylists(wimp.user.id, function(err, playlists){
			var playlist = playlists[0];
			playlist.getTracks(function(err, wimpTracks){
				_.forEach(wimpTracks, function(wimpTrack, index, array){
					getSpotifyTrack(wimpTrack.artist.name, wimpTrack.album.title, wimpTrack.title, function(err, data){
						var spotifyItems = data.tracks.items;
						var tmp;
						// Sort by most popular
						tmp = _(spotifyItems).sortBy(function(item){
							return item.popularity;
						}).reverse();
						spotifyItems = tmp.__wrapped__;
						if(spotifyItems && spotifyItems[0]){
							var uri = spotifyItems[0].uri;
							if(uri){
								console.log(uri);
								playlistTracks.push(uri);
							}
						}
						console.log(index, array.length);
						if(index === array.length - 1){
							if(fn){
								fn(null, playlistTracks);
							}							
						}
					});
				});
			});
		});			
	});
};
var getSpotifyTrack = function getSpotifyTrack(artist, album, track, fn){
	var query = [];
	if(artist){
		query.push('artist:' + artist + '');
	}
	if(album){
		query.push('album:' + album + '');
	}
	if(track){
		query.push('track:' + track + '');
	}
	queryStr = query.join(' ');

	spotifyApi.searchTracks(queryStr)
	.then(function(data){
		// If the song could not be found, try without album name
		if(!album && (!data || !data.tracks || !data.tracks.items || data.tracks.items.length == 0)){
			getSpotifyTrack(artist, null, track, fn);
		}else{
			fn(null, data);
		}
	}, function(err){
		console.log('Something went wrong!', err);
		fn(err);
	});
};
var createSpotifyPlaylist = function(username, playlistName, fn){
	spotifyApi.createPlaylist(username, playlistName, {'public': false})
	.then(function(data){
		console.log('Created playlist!');
		if(fn){
			fn(null, data);
		}
	}, function(err){
		console.log('Something went wrong!', err);
		if(fn){
			fn(null, data);
		}
	});
};
var addToSpotifyPlaylist = function(username, playlist, tracks, fn){
	console.log(arguments);
	spotifyApi.addTracksToPlaylist(username, playlist, tracks)
	.then(function(data){
		console.log('Added tracks to playlist!');
		if(fn){
			fn(null, data);
		}
	}, function(err){
 		console.log('Something went wrong!', err);
		if(fn){
			fn(err);
		}
	});
};
var authCode = config.authCode;
auth(authCode, function(err){
	console.log(err)
	if(err){
		var authorizeURL = spotifyApi.createAuthorizeURL(['user-read-private', 'user-read-email', 'user-library-read', 'playlist-modify-private', 'playlist-modify-public', 'playlist-read-private']);
		console.log('wrong auth code');
		console.log(authorizeURL);
		return;
	}
	getWimpPlaylist(function(err, playlistTracks){
		console.log(err, playlistTracks);
		var add = function add(playlist, playlistTracks, num1, num2, fn){
			addToSpotifyPlaylist(config.spotifyUsername, playlist.id, playlistTracks.slice(num1, num2), fn);
		}.bind(this);
		createSpotifyPlaylist(config.spotifyUsername, 'Imported from WiMP', function(err, playlist){
			console.log(err, playlist)
			if(playlist){
				console.log(playlist);
				// You can only add 100 tracks at once
				// This hack adds 100 tracks each time
				// This could be done in a better way
				if(playlistTracks.length > 100){
					var lastIndex = 0;
					playlistTracks.forEach(function(track, index, array){
						var tmp = (index / 100);
						var roundedIndex = Math.round(index);
						if(tmp >= 0 && tmp == Math.round(tmp) && lastIndex !== roundedIndex){
							add(playlist, playlistTracks, 0, roundedIndex, function(){
								console.log(arguments);
								add(playlist, playlistTracks, roundedIndex, playlistTracks.length);
							});
							lastIndex = roundedIndex;
						}
					});
				}else{
					addToSpotifyPlaylist(config.spotifyUsername, playlist.id, playlistTracks, function(err, debug){
						console.log(debug);
					});
				}
			}
		});
	});
});