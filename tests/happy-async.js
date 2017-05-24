const 	meh = require( "../index" ),
		assert = require( "assert" );

function later( fn ) {
	setImmediate( fn )
}

exports.minimal = function( test ) {	
	const 	sink = meh.source()
				      .sink( handler ),
			request = sink.request( "GET", "foo" );

	request.sink( "response", response => {
		assert.equal( response.status, 200 );
		assert( response.headers );
		
		response.sink( "body", body => {
			assert.equal( body, "Hello world!" );
			test.done();
		} );
	} );

	later( () => sink.submit( request ) );

	function handler( request ) {
		assert.equal( request.method, "GET" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		
		var response;

		later( () => (response = request.respond( 200 )) );
		later( () => response.body( "Hello world!" ) );
	}
}

exports.middleware = function( test ) {
	const 	sink = meh.source()
					  .pipe( middle )
				      .sink( handler ),
			request = sink.request( "GET", "foo" );

	request.sink( "response", response => {
		assert.equal( response.status, 200 );
		assert( response.headers );
		
		response.sink( "body", body => {
			assert.equal( body, "Hello middleware world!" );
			test.done();
		} );
	} );

	later( () => sink.submit( request ) );

	function middle( request, _, next ) {
		request.headers["x-middleware"] = "bar";

		request.pipe( "response", (response, next) => {
			later( () => response.pipe( "body", (body, next) => {
				assert.equal( body, "Hello world!" );
				later( () => next( "Hello middleware world!" ) );
			} ) );

			later( next );
		} );

		later( next );
	}

	function handler( request ) {
		assert.equal( request.method, "GET" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		assert.equal( request.headers["x-middleware"], "bar" );
	
		var response;

		later( () => (response = request.respond( 200 )) );
		later( () => response.body( "Hello world!" ) );
	}
}

exports.middlewareRender = function( test ) {
	const 	sink = meh.source()
					  .pipe( middle )
				      .sink( handler ),
			request = sink.request( "GET", "foo" ),

			response_body = { foo: "bar", bar: 1 };

	request.sink( "response", response => {
		assert.equal( response.status, 200 );
		assert( response.headers );
		
		var	output = "";

		response.sink( "data", chunk => {
			if( chunk )
				output += chunk.toString();
			else {				
				assert.deepEqual( JSON.parse( output ), response_body );
				test.done();
			}
		} );
	} );

	later( () => sink.submit( request ) );

	function middle( request, _, next ) {
		request.headers["x-middleware"] = "bar";

		request.pipe( "response", (response, next) => {
			later( () => response.sink( "body", body => {
				const response_data = JSON.stringify( body );
				later( () => response.data( new Buffer( response_data.substr( 0, 10 ) ) ) );
				later( () => response.data( new Buffer( response_data.substr( 10 ) ) ) );
				later( () => response.data() );
			} ) );

			later( next );
		} );

		later( next );
	}

	function handler( request ) {
		assert.equal( request.method, "GET" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		assert.equal( request.headers["x-middleware"], "bar" );

		var response;

		later( () => (response = request.respond( 200 )) );
		later( () => response.body( response_body ) );
	}
}

exports.middlewareParse = function( test ) {
	const 	sink = meh.source()
					  .pipe( middle )
				      .sink( handler ),
			request = sink.request( "POST", "foo" ),

			request_body = { foo: "bar", bar: 1 };

	request.sink( "response", response => {
		assert.equal( response.status, 200 );
		assert( response.headers );
		
		response.sink( "body", body => {
			assert.equal( body, "Hello world!" );
			test.done();
		} );
	} );

	later( () => sink.submit( request ) );

	const request_data = JSON.stringify( request_body );

	later( () => request.data( new Buffer( request_data.substr( 0, 10 ) ) ) );
	later( () => request.data( new Buffer( request_data.substr( 10 ) ) ) );
	later( () => request.data() );

	function middle( request, _, next ) {
		request.headers["x-middleware"] = "bar";

		var input = "";

		request.sink( "data", chunk => {
			if( chunk )
				input += chunk.toString();
			else
				request.body( JSON.parse( input ) );
		} );

		later( next );
	}

	function handler( request ) {
		assert.equal( request.method, "POST" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		assert.equal( request.headers["x-middleware"], "bar" );
	
		request.sink( "body", body => {
			assert.deepEqual( body, request_body );

			var response;

			later( () => (response = request.respond( 200 )) );
			later( () => response.body( "Hello world!" ) );
		} );
	}
}

