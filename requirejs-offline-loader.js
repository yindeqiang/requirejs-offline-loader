/*!
* basket.js
* http://github.com/yindeqiang/requirejs-offline-loader
* Created by: yindeqiang
*/
(function( window, document ) {
	'use strict';

	var head = document.head || document.getElementsByTagName('head')[0];
	var storagePrefix = 'basket-';
	var defaultExpiration = 5000;
	var inBasket = [];

	var addLocalStorage = function( key, storeObj ) {
		try {
			localStorage.setItem( storagePrefix + key, JSON.stringify( storeObj ) );
			return true;
		} catch( e ) {
			if ( e.name.toUpperCase().indexOf('QUOTA') >= 0 ) {
				var item;
				var tempScripts = [];

				for ( item in localStorage ) {
					if ( item.indexOf( storagePrefix ) === 0 ) {
						tempScripts.push( JSON.parse( localStorage[ item ] ) );
					}
				}

				if ( tempScripts.length ) {
					tempScripts.sort(function( a, b ) {
						return a.stamp - b.stamp;
					});

					basket.remove( tempScripts[ 0 ].key );

					return addLocalStorage( key, storeObj );

				} else {
					// no files to remove. Larger than available quota
					return;
				}

			} else {
				// some other error
				return;
			}
		}

	};

	var getUrl = function( url, callback ) {

		var xhr = new XMLHttpRequest();
		xhr.open( 'GET', url );

		xhr.onreadystatechange = function() {
			if ( xhr.readyState === 4 ) {
				if ( ( xhr.status === 200 ) ||
						( ( xhr.status === 0 ) && xhr.responseText ) ) {

					var result = xhr.responseText.replace(/[\u4e00-\u9fa5]/g,  function (str){
                        return window.escape(str).replace(/(%u)(\w{4})/gi,'\\u$2');
                    });
					callback( {
						content: result,
						type: xhr.getResponseHeader('content-type')
					} );
				} else {
					alert('文件加载出现错误，请重试！');
					console.error( new Error( xhr.statusText ) );
				}
			}
		};

		// By default XHRs never timeout, and even Chrome doesn't implement the
		// spec for xhr.timeout. So we do it ourselves.
		setTimeout( function () {
			if( xhr.readyState < 4 ) {
				xhr.abort();
			}
		}, basket.timeout );
		// xhr.setRequestHeader('Accept-Charset', 'UTF-8');
		//xhr.setRequestHeader('Content-Type', 'text/javascript;charset=UTF-8');
		xhr.send();
	};

	var saveUrl = function( obj ) {
		return getUrl( obj.url , function( result ) {
			var storeObj = wrapStoreData( obj, result );

			if (!obj.skipCache) {
				addLocalStorage( obj.key , storeObj );
			}

			//执行加载完毕
			if(obj.fetchComplete){
				obj.fetchComplete();
			}
			execute(obj);
			return storeObj;
		});
	};

	var wrapStoreData = function( obj, data ) {
		var now = +new Date();
		obj.data = data.content;
		obj.originalType = data.type;
		obj.type = obj.type || data.type;
		obj.skipCache = obj.skipCache || false;
		obj.stamp = now;
		obj.expire = now + ( ( obj.expire || defaultExpiration ) * 60 * 60 * 1000 );

		return obj;
	};

	var isCacheValid = function(source, obj) {
		return !source ||
			source.expire - +new Date() < 0  ||
			(basket.isValidItem && !basket.isValidItem(source, obj));
	};

	var handleStackObject = function( obj ) {
		var source, shouldFetch;

		if ( !obj.url ) {
			return;
		}

		obj.key =  ( obj.key || obj.url );
		source = basket.get( obj.key );
                
		obj.execute = obj.execute !== false;

		shouldFetch = isCacheValid(source, obj);

		//必须更新的时候，防止一个文件因为前缀的版本号不同，而存在多个
		if(source && shouldFetch){
			var key = obj.key;
			var res = key.split('/');
			var fileName = res[res.length-1]; //文件名
			var prefix = key.replace(fileName, ''); //路径
			fileName = fileName.replace(/[\d\w]{8}\.([\w\d\.]+)(js|css)/,'$1$2');
			for(var item in localStorage){
				if(item.lastIndexOf(fileName) === item.length - fileName.length  && item.indexOf(storagePrefix + prefix) === 0){
					localStorage.removeItem(item);
				}
			}
		}


		if( obj.live || shouldFetch ) {

			saveUrl( obj );

			/*
			if( obj.live && !shouldFetch ) {
				promise = promise
					.then( function( result ) {
						// If we succeed, just return the value
						// RSVP doesn't have a .fail convenience method
						return result;
					}, function() {
						return source;
					});
			}*/
		} else {
			source.type = obj.type || source.originalType;
			source.execute = obj.execute;
			if(obj.fetchComplete){
				obj.fetchComplete();
			}
			execute(source);
		}
	};

	var injectScript = function( obj ) {
		var script = document.createElement('script');
		//script.defer = true;
		// Have to use .text, since we support IE8,
		// which won't allow appending to a script
		//script.text = obj.data;
		script.async = true;
		script.src = encodeURI('data:text/javascript,' + obj.data);
		script.setAttribute('data-key', obj.key);
		script.addEventListener('load', onScriptLoad, false);
        script.addEventListener('error', onScriptError, false);
		head.appendChild( script );
	};

	var onScriptLoad = function(event){
		var key = event.target.getAttribute('data-key');
		if(!key) {
			return;
		}
		var obj = getBasketObj(key);
		if(obj.loadComplete){
			obj.loadComplete();
		}
	};

	var onScriptError = function(event){
		console.error(event);
	};

	var handlers = {
		'default': injectScript
	};

	var execute = function( obj ) {
		if( !obj.execute ) {
			return;
		}
		if( obj.type && handlers[ obj.type ] ) {
			return handlers[ obj.type ]( obj );
		}

		return handlers['default']( obj ); // 'default' is a reserved word
	};

	var fetch = function() {
		var i, l, promises = [];

		for ( i = 0, l = arguments.length; i < l; i++ ) {
			promises.push( handleStackObject( arguments[ i ] ) );
		}
	};

	var isInBasket = function(url){
		for(var i=0; i<inBasket.length; i++){
			if(inBasket[i].url && inBasket[i].url === url){
				return i;
			}
		}
		return -1;
	};

	var getBasketObj = function(key){
		for(var i=0; i<inBasket.length; i++){
			if(inBasket[i].key && inBasket[i].key === key){
				return inBasket[i];
			}
		}
		return null;
	};

	window.basket = {
		require: function() {
			for ( var a = 0, l = arguments.length; a < l; a++ ) {
				arguments[a].execute = arguments[a].execute !== false;
				
				if ( arguments[a].once && isInBasket(arguments[a].url) >= 0 ) {
					arguments[a].execute = false;
				} else if ( arguments[a].execute !== false && isInBasket(arguments[a].url) < 0 ) {  
					inBasket.push(arguments[a]);
				} 
			}
                        
			fetch.apply(null, arguments);
		},

		remove: function( key ) {
			localStorage.removeItem( storagePrefix + key );
			return this;
		},

		get: function( key ) {
			var item = localStorage.getItem( storagePrefix + key );
			try	{
				return JSON.parse( item || 'false' );
			} catch( e ) {
				return false;
			}
		},

		clear: function( expired ) {
			var item, key;
			var now = +new Date();

			for ( item in localStorage ) {
				key = item.split( storagePrefix )[ 1 ];
				if ( key && ( !expired || this.get( key ).expire <= now ) ) {
					this.remove( key );
				}
			}

			return this;
		},

		isValidItem: null,

		timeout: 5000,

		addHandler: function( types, handler ) {
			if( !Array.isArray( types ) ) {
				types = [ types ];
			}
			types.forEach( function( type ) {
				handlers[ type ] = handler;
			});
		},

		removeHandler: function( types ) {
			basket.addHandler( types, undefined );
		}
	};

	// delete expired keys
	basket.clear( true );

})( this, document );


//加载js的插件，配合requirejs
(function (window, document, basket, requirejs) {
	'use strict';
	
    var ct;
    var mn;

    var jsCallback = function(obj){
        var script = document.createElement('script');
        script.setAttribute('data-requirecontext', ct.contextName);
        script.setAttribute('data-requiremodule', mn);
        script.async = true;
        script.charset = 'utf-8';
        script.src = encodeURI('data:text/javascript,' + obj.data);
        script.addEventListener('load', ct.onScriptLoad, false);
        script.addEventListener('error', ct.onScriptError, false);
        var head = document.getElementsByTagName('head')[0];
        head.appendChild( script );
    };

    basket.addHandler('application/javascript', jsCallback);
    basket.addHandler('application/x-javascript; charset=utf-8', jsCallback);

    var originalLader = requirejs.load;
    requirejs.load = function (context, moduleName, url) {
        
        /**
         * There is currently no public way to access requirejs's config.
         * As suggested by James Burke, we can somewhat rely on the semi-private "requirejs.s.contexts._.config" as it has not changed between 1.0 and 2.0.
         *
         * Source: https://groups.google.com/forum/#!topic/requirejs/Hf-qNmM0ceI
         */

        var config = requirejs.s.contexts._.config;
        if (config.basket && config.basket.excludes && config.basket.excludes.indexOf(moduleName) !== -1) {
            originalLader(context, moduleName, url);
        } else {
            var unique = 1;
            if(config.basket && config.basket.unique && config.basket.unique.hasOwnProperty(moduleName) ){
                unique = config.basket.unique[moduleName];
            }

            basket.require({ url: url,unique:unique , fetchComplete: function(){
                ct = context;
                mn = moduleName;
            }});
        }
    };

})(this, document, basket, requirejs);
