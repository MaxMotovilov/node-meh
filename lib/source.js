module.exports = exports = function source() { return new Source }

const EventEmitter = require('events');

class Stage extends EventEmitter {
	
	get hasFailed() { return this._stopped instanceof Error }

	get hasCompleted() { return this._stopped }

	fail( err ) { 
		if( !this.hasFailed ) {
			this._stopped = err;
			this.emit( "error", err );
			this._close();
			return true
		}
	}

	complete() {
		if( this.hasCompleted ) {
			fail( new Error( "Message sent out of sequence" ) );
		} else {
			this._stopped = true;
			this._close();
		}
	}

	_close() {
		const self = this;
		if( !this._closed ) {
			this._closed = true;
			process.nextTick( () => self.emit( "close" ) );
		}
	}
}

class MessageTarget {

	constructor( stage ) {
		this._stage = stage || this;
		this._msg = {};
	}

	pipe( message, handler ) {
		return this._msg[message] = { handler: handler }
	}

	sink( message, handler ) {
		this.pipe( message, handler ).capped = true
	}

	_dispatch( message, payload ) {
		var slot, curr = this, next;

		while( !curr._stage.hasFailed && (slot = curr._msg[message], next = curr._next_mt) && !slot )
			curr = next;

		if( !curr._stage.hasFailed ) {
			if( typeof next === 'undefined' )
				(curr._delayed || (curr._delayed = []))
					.push( [ message, payload ] );
			else if( slot )
				try {
					slot.handler( payload, slot.capped ? null : forward )
				} catch( err ) {
					curr._stage.fail( err )
				}
			else
				curr._undeliverable( message );
		}

		function forward( updated_payload ) {
			if( updated_payload instanceof Error )
				curr._stage.fail( updated_payload );
			else
				next._dispatch( message, updated_payload == null ? payload : updated_payload )
		} 
	}

	_undeliverable( message ) {
		this._stage.fail( new Error( "Undeliverable message \"" + message + "\"" ) )
	}

	_connect( target ) {
		this._next_mt = target || null;
		while( this._delayed && this._delayed.length )
			this._dispatch.apply( this, this._delayed.shift() );
	}

	_cap() { this._connect( null ) }
}

class Request extends Stage {

	constructor() {
		super();
		this._mt_down = new MessageTarget( this );
	}

	_init( method, url, headers, next_mt_up ) {
		this.method = method;
		this.url = url;
		this.headers = headers || {};
		if( next_mt_up )
			this._next_mt_up = next_mt_up;
		return this;
	}

	_upstream() {
		return this._up_req || (this._up_req = new Request)
	}

	_ready( capped_down ) {
		if( capped_down && this._up_req )
			this.fail( new Error( "Cannot send messages past a sink" ) );
		else {
			this._mt_down._connect( this._upstream()._mt_down );
			if( this._mt_up ) {
				this._mt_up._connect( this._next_mt_up );
				return this._mt_up;
			} else {
				return this._next_mt_up;
			}
		}
	}
	
	pipe( message, handler ) {
		const wrapper = { response: "_wrapResponse", upstreamError: "_wrapUpstreamError" }[ message ];
		return wrapper ? this[wrapper].call( this, handler ) : this._mt_down.pipe( message, handler )
	}

	get sink() { return this._mt_down.sink }

	_wrapResponse( handler ) {
		return (this._mt_up || (this._mt_up = new MessageTarget( this )))
				.pipe( "response", (response, next) => {
					handler( response, next && (err => {
						if( err instanceof Error )
							next( err );
						else if( this._responded )
							next( new Error( "Response has already been sent" ) );
						else if( !this._next_mt_up )
							this._mt_up._undeliverable( "response" );
						else {
							this._responded = true;
							next( response._downstream( this._next_mt_up ) );
						}
					}) );

					if( !next )
						 response._cap();
				} )
	}

	_wrapUpstreamError( handler ) {
		return (this._mt_up || (this._mt_up = new MessageTarget( this )))
				.pipe( "upstreamError", (upstream_err, next) =>
					handler( upstream_err, next && (err => {
						next( err );
						if( err == null )
							this.fail( upstream_err );
					}) ) 
				)
	}

	body( body ) {
		this._upstream()._mt_down._dispatch( "body", body )
	}

	data( data ) {
		this._upstream()._mt_down._dispatch( "data", data )
	}

	fail( err ) {
		if( super.fail( err ) ) {
			this._next_mt_up && this._next_mt_up._dispatch( "upstreamError", err );
			this._up_req && this._up_req._mt_down._dispatch( "downstreamError", err );
		}
	}

	respond( status, headers, body ) {
		if( this._responded )
			this.fail( new Error( "Response has already been sent" ) );
		else if( !this._next_mt_up )
			this._mt_down._undeliverable( "response" );
		else {
			let res = new Response( this._next_mt_up )._init( status, headers );
			this._responded = true;

			this._next_mt_up._dispatch( "response", res );

			if( body != null )
				res.body( body );
		}
	}
}

class Response extends MessageTarget {

	constructor( target ) {
		super( target._stage )
	}

	_init( status, headers ) {
		this.status = status;
		this.headers = headers || {};
		return this
	}

	_downstream( target ) {
		const ds = new Response( target )._init( this.status, copyHeaders( this.headers ) );
		this._connect( ds );
		return ds
	}

	body( body ) { this._dispatch( "body", body ) }
	
	data( data ) { this._dispatch( "data", data ) }
}

class Source {
	constructor() {
		this._handlers = [];
	}
	
	get isSink() { return this._capped }
	get isPipe() { return !this._capped }

	pipe( handler ) {
		if( this._capped )
			throw Error( "Cannot extend pipe past a sink" );
		this._handlers.push( handler );
		return this
	}

	sink( handler ) {
		this.pipe( handler );
		this._capped = true;
		return this
	}

	request( method, url, headers ) {
		return new Request()._init( method, url, headers )
	}

	submit( request, state, after ) {
		if( typeof state === 'function' )
			after = state,
			state = null;

		state = state || {};

		if( !after == !this._capped ) {
			if( after )
				throw Error( "Cannot extend pipe past a sink" );
			else
				after = unterminatedPipe;
		}

		const handlers = this._handlers;
		
		var prev_up_mt = request._ready(), stage_no = 0;

		stage();

		function stage() {
			request = request._upstream()
							 ._init( request.method, request.url, copyHeaders( request.headers ), prev_up_mt )
			
			if( stage_no == handlers.length )
				after && after( request, state );
			else
				try {
					let forward = stage_no < handlers.length-1 || after ? next : null;
					handlers[stage_no]( request, state, forward );
					if( !forward )
						request._ready();
				} catch( err ) {
					request.fail( err )
				}
		}

		function next( err ) {
			if( err instanceof Error )
				request.fail( err );
			else {
				let capped = ++stage_no == handlers.length && !after;
				(capped ? request.sink : request.pipe).call( request, "downstreamError", propagateDownstreamError ); 
				prev_up_mt = request._ready( capped );
				stage();
			}
		}

		function propagateDownstreamError( err, next ) {
			request.fail( err );
			next && next();
		}
	}
}

function copyHeaders( headers ) {
	const result = {};
	if( headers )
		for( var h in headers )
			if( headers.hasOwnProperty( h ) )
				result[h] = Array.isArray( headers[h] ) ? headers[h].slice( 0 ) : headers[h];
	return result
}

function unterminatedPipe( request ) {
	request.fail( new Error( "No sink was provided for the request" ) )
}

