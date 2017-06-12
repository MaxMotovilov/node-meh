const 	meh = require( "../index" ),
        cort = require( "cort-unit/nodeunit" ),
        assert = require( "assert" );

exports.minimal = cort( function( test ) {	
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

    test.later( () => sink.submit( request ) );

    function handler( request ) {
        assert.equal( request.method, "GET" );
        assert.equal( request.url, "foo" );
        assert( request.headers );
        
        var response;

        test.later( () => (response = request.respond( 200 )) )
            .later( () => response.body( "Hello world!" ) );
    }
} );

exports.middleware = cort( function( test ) {
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

    test.later( () => sink.submit( request ) );

    function middle( request, _, next ) {
        request.headers["x-middleware"] = "bar";

        request.pipe( "response", (response, next) => {

            test.later( "response.pipe", () => response.pipe( "body", (body, next) => {
                assert.equal( body, "Hello world!" );
                test.later( () => next( "Hello middleware world!" ) );
            } ) )
                .later( "response.next", () => next() );
        } );

        test.later( "middle.next", () => next() );
    }

    function handler( request ) {
        assert.equal( request.method, "GET" );
        assert.equal( request.url, "foo" );
        assert( request.headers );
        assert.equal( request.headers["x-middleware"], "bar" );
    
        var response;

        test.later( () => (response = request.respond( 200 )) )
            .later( () => response.body( "Hello world!" ) );
    }
} );

exports.middlewareRender = cort( function( test ) {
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

    test.later( () => sink.submit( request ) );

    function middle( request, _, next ) {
        request.headers["x-middleware"] = "bar";

        request.pipe( "response", (response, next) => {
            test.later( "response.sink", () => response.sink( "body", body => {
                const response_data = JSON.stringify( body );
                test.later( () => response.data( new Buffer( response_data.substr( 0, 10 ) ) ) )
                    .later( () => response.data( new Buffer( response_data.substr( 10 ) ) ) )
                    .later( () => response.data() );
            } ) )
                .later( "response.next", () => next() );
        } );

        test.later( "middle.next", () => next() );
    }

    function handler( request ) {
        assert.equal( request.method, "GET" );
        assert.equal( request.url, "foo" );
        assert( request.headers );
        assert.equal( request.headers["x-middleware"], "bar" );

        var response;

        test.later( () => (response = request.respond( 200 )) )
            .later( () => response.body( response_body ) );
    }
} );

exports.middlewareParse = cort( function( test ) {
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

    const request_data = JSON.stringify( request_body );

    test.later( () => sink.submit( request ) )
        .later( () => request.data( new Buffer( request_data.substr( 0, 10 ) ) ) )
        .later( () => request.data( new Buffer( request_data.substr( 10 ) ) ) )
        .later( () => request.data() );

    function middle( request, _, next ) {
        request.headers["x-middleware"] = "bar";

        var input = "";

        request.sink( "data", chunk => {
            if( chunk )
                input += chunk.toString();
            else
                request.body( JSON.parse( input ) );
        } );

        test.later( "middle.next", () => next() );
    }

    function handler( request ) {
        assert.equal( request.method, "POST" );
        assert.equal( request.url, "foo" );
        assert( request.headers );
        assert.equal( request.headers["x-middleware"], "bar" );
    
        request.sink( "body", body => {
            assert.deepEqual( body, request_body );

            var response;

            test.later( () => (response = request.respond( 200 )) )
                .later( () => response.body( "Hello world!" ) );
        } );
    }
} );

