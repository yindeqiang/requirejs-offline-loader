/*!
* rol.js
*  http://github.com/yindeqiang/requirejs-offline-loader
* Created by: yindeqiang
*/
(function( window, document ) {
	'use strict';

	var head = document.head || document.getElementsByTagName('head')[0];
	var storagePrefix = 'rol-';
	var defaultExpiration = 5000;
	var inrol = [];

	/**
	 * 添加到localstorage中进行存储
	 */
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

					rol.remove( tempScripts[ 0 ].key );

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
					
					/**
					 * 对js中的中文进行转码，防止在页面中出现乱码，尤其在调用模板的时候
					 */
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

		setTimeout( function () {
			if( xhr.readyState < 4 ) {
				xhr.abort();
			}
		}, rol.timeout );
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
			(rol.isValidItem && !rol.isValidItem(source, obj));
	};

	var handleStackObject = function( obj ) {
		var source, shouldFetch;

		if ( !obj.url ) {
			return;
		}

		obj.key =  ( obj.key || obj.url );
		source = rol.get( obj.key );
                
		obj.execute = obj.execute !== false;

		shouldFetch = isCacheValid(source, obj);

		/**
		 * 必须更新的时候，防止一个文件因为前缀的版本号不同，而存在多个
		 */
		if(source && shouldFetch){
			var key = obj.key;
			var res = key.split('/');
			var fileName = res[res.length-1]; //文件名
			var prefix = key.replace(fileName, ''); //路径
			fileName = fileName.replace(/[\d\w]{8}\.([\w\d\.]+)(js|css)/,'$1$2'); //匹配类似 l0d9b3jy.test.js
			for(var item in localStorage){
				if(item.lastIndexOf(fileName) === item.length - fileName.length  && item.indexOf(storagePrefix + prefix) === 0){
					localStorage.removeItem(item);
				}
			}
		}

		if( obj.live || shouldFetch ) {
			saveUrl( obj );
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
		var obj = getrolObj(key);
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

	var isInrol = function(url){
		for(var i=0; i<inrol.length; i++){
			if(inrol[i].url && inrol[i].url === url){
				return i;
			}
		}
		return -1;
	};

	var getrolObj = function(key){
		for(var i=0; i<inrol.length; i++){
			if(inrol[i].key && inrol[i].key === key){
				return inrol[i];
			}
		}
		return null;
	};

	window.rol = {
		require: function() {
			for ( var a = 0, l = arguments.length; a < l; a++ ) {
				arguments[a].execute = arguments[a].execute !== false;
				
				if ( arguments[a].once && isInrol(arguments[a].url) >= 0 ) {
					arguments[a].execute = false;
				} else if ( arguments[a].execute !== false && isInrol(arguments[a].url) < 0 ) {  
					inrol.push(arguments[a]);
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
			rol.addHandler( types, undefined );
		}
	};

	// delete expired keys
	rol.clear( true );

})( this, document );


/**
 * 加载js的插件，配合requirejs
 */
(function (window, document, rol, requirejs) {
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

    rol.addHandler('application/javascript', jsCallback);
    rol.addHandler('application/x-javascript; charset=utf-8', jsCallback);

    var originalLader = requirejs.load;
    requirejs.load = function (context, moduleName, url) {
		//requirejs.s.contexts._.config 内部属性
        var config = requirejs.s.contexts._.config;
        if (config.rol && config.rol.excludes && config.rol.excludes.indexOf(moduleName) !== -1) {
            originalLader(context, moduleName, url);
        } else {
            var unique = 1;
            if(config.rol && config.rol.unique && config.rol.unique.hasOwnProperty(moduleName) ){
                unique = config.rol.unique[moduleName];
            }

            rol.require({ url: url,unique:unique , fetchComplete: function(){
                ct = context;
                mn = moduleName;
            }});
        }
    };

})(this, document, rol, requirejs);
