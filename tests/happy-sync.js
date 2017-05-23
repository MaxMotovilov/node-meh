const 	meh = require( "../index" ),
		assert = require( "assert" );

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

	sink.submit( request );
	request.body();

	function handler( request ) {
		assert.equal( request.method, "GET" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		
		request.respond( 200, null, "Hello world!" );
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

	sink.submit( request );
	request.body();

	function middle( request, _, next ) {
		request.headers["x-middleware"] = "bar";

		request.pipe( "response", (response, next) => {
			response.pipe( "body", (body, next) => {
				assert.equal( body, "Hello world!" );
				next( "Hello middleware world!" );
			} );

			next();
		} );

		next();
	}

	function handler( request ) {
		assert.equal( request.method, "GET" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		assert.equal( request.headers["x-middleware"], "bar" );
	
		request.respond( 200, null, "Hello world!" );
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

	sink.submit( request );
	request.body();

	function middle( request, _, next ) {
		request.headers["x-middleware"] = "bar";

		request.pipe( "response", (response, next) => {
			response.sink( "body", body => {
				const response_data = JSON.stringify( body );
				response.data( new Buffer( response_data.substr( 0, 10 ) ) );
				response.data( new Buffer( response_data.substr( 10 ) ) );
				response.data();
			} );

			next();
		} );

		next();
	}

	function handler( request ) {
		assert.equal( request.method, "GET" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		assert.equal( request.headers["x-middleware"], "bar" );

		request.respond( 200, null, response_body );
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

	sink.submit( request );

	const request_data = JSON.stringify( request_body );
	request.data( new Buffer( request_data.substr( 0, 10 ) ) );
	request.data( new Buffer( request_data.substr( 10 ) ) );
	request.data();

	function middle( request, _, next ) {
		request.headers["x-middleware"] = "bar";

		var input = "";

		request.sink( "data", chunk => {
			if( chunk )
				input += chunk.toString();
			else
				request.body( JSON.parse( input ) );
		} );

		next();
	}

	function handler( request ) {
		assert.equal( request.method, "POST" );
		assert.equal( request.url, "foo" );
		assert( request.headers );
		assert.equal( request.headers["x-middleware"], "bar" );
	
		request.sink( "body", body => {
			assert.deepEqual( body, request_body );
			request.respond( 200, null, "Hello world!" );
		} );
	}
}
