QUnit.module( "deprecated", { afterEach: moduleTeardown } );

if ( includesModule( "deprecated" ) ) {

QUnit.test( "bind/unbind", function( assert ) {
	assert.expect( 4 );

	var markup = jQuery(
		"<div><p><span><b>b</b></span></p></div>"
	);

	markup
		.find( "b" )
		.bind( "click", { bindData: 19 }, function( e, trig ) {
			assert.equal( e.type, "click", "correct event type" );
			assert.equal( e.data.bindData, 19, "correct trigger data" );
			assert.equal( trig, 42, "correct bind data" );
			assert.equal( e.target.nodeName.toLowerCase(), "b", "correct element" );
		} )
		.trigger( "click", [ 42 ] )
		.unbind( "click" )
		.trigger( "click" )
		.remove();
} );

QUnit.test( "delegate/undelegate", function( assert ) {
	assert.expect( 2 );

	var markup = jQuery(
		"<div><p><span><b>b</b></span></p></div>"
	);

	markup
		.delegate( "b", "click", function( e ) {
			assert.equal( e.type, "click", "correct event type" );
			assert.equal( e.target.nodeName.toLowerCase(), "b", "correct element" );
		} )
		.find( "b" )
			.trigger( "click" )
			.end()
		.undelegate( "b", "click" )
		.remove();
} );

QUnit.test( "hover() mouseenter mouseleave", function( assert ) {
	assert.expect( 1 );

	var times = 0,
		handler1 = function() {
 ++times;
},
		handler2 = function() {
 ++times;
};

	jQuery( "#firstp" )
		.hover( handler1, handler2 )
		.mouseenter().mouseleave()
		.off( "mouseenter", handler1 )
		.off( "mouseleave", handler2 )
		.hover( handler1 )
		.mouseenter().mouseleave()
		.off( "mouseenter mouseleave", handler1 )
		.mouseenter().mouseleave();

	assert.equal( times, 4, "hover handlers fired" );
} );

QUnit.test( "trigger() shortcuts", function( assert ) {
	assert.expect( 5 );

	var counter, clickCounter,
		elem = jQuery( "<li><a href='#'>Change location</a></li>" ).prependTo( "#firstUL" );
	elem.find( "a" ).on( "click", function() {
		var close = jQuery( "spanx", this ); // same with jQuery(this).find("span");
		assert.equal( close.length, 0, "Context element does not exist, length must be zero" );
		assert.ok( !close[ 0 ], "Context element does not exist, direct access to element must return undefined" );
		return false;
	} ).click();

	// manually clean up detached elements
	elem.remove();

	jQuery( "#check1" ).click( function() {
		assert.ok( true, "click event handler for checkbox gets fired twice, see trac-815" );
	} ).click();

	counter = 0;
	jQuery( "#firstp" )[ 0 ].onclick = function() {
		counter++;
	};
	jQuery( "#firstp" ).click();
	assert.equal( counter, 1, "Check that click, triggers onclick event handler also" );

	clickCounter = 0;
	jQuery( "#john1" )[ 0 ].onclick = function() {
		clickCounter++;
	};
	jQuery( "#john1" ).click();
	assert.equal( clickCounter, 1, "Check that click, triggers onclick event handler on an a tag also" );
} );

if ( includesModule( "ajax" ) ) {
	ajaxTest( "Ajax events aliases (with context)", 12, function( assert ) {
		var context = document.createElement( "div" );

		function event( e ) {
			assert.equal( this, context, e.type );
		}

		function callback( msg ) {
			return function() {
				assert.equal( this, context, "context is preserved on callback " + msg );
			};
		}

		return {
			setup: function() {
				jQuery( context ).appendTo( "#foo" )
					.ajaxSend( event )
					.ajaxComplete( event )
					.ajaxError( event )
					.ajaxSuccess( event );
			},
			requests: [ {
				url: url( "name.html" ),
				context: context,
				beforeSend: callback( "beforeSend" ),
				success: callback( "success" ),
				complete: callback( "complete" )
			}, {
				url: url( "404.txt" ),
				context: context,
				beforeSend: callback( "beforeSend" ),
				error: callback( "error" ),
				complete: callback( "complete" )
			} ]
		};
	} );
}

QUnit.test( "Event aliases", function( assert ) {

	// Explicitly skipping focus/blur events due to their flakiness
	var	$elem = jQuery( "<div></div>" ).appendTo( "#qunit-fixture" ),
		aliases = ( "resize scroll click dblclick mousedown mouseup " +
			"mousemove mouseover mouseout mouseenter mouseleave change " +
			"select submit keydown keypress keyup contextmenu" ).split( " " );
	assert.expect( aliases.length );

	jQuery.each( aliases, function( i, name ) {

		// e.g. $(elem).click(...).click();
		$elem[ name ]( function( event ) {
			assert.equal( event.type, name, "triggered " + name );
		} )[ name ]().off( name );
	} );
} );

QUnit.test( "jQuery.escapeSelector", function( assert ) {
	assert.expect( 58 );

	// Edge cases
	assert.equal( jQuery.escapeSelector(), "undefined", "Converts undefined to string" );
	assert.equal( jQuery.escapeSelector( "-" ), "\\-", "Escapes standalone dash" );
	assert.equal( jQuery.escapeSelector( "-a" ), "-a", "Doesn't escape leading dash followed by non-number" );
	assert.equal( jQuery.escapeSelector( "--" ), "--", "Doesn't escape standalone double dash" );
	assert.equal( jQuery.escapeSelector( "\uFFFD" ), "\uFFFD",
		"Doesn't escape standalone replacement character" );
	assert.equal( jQuery.escapeSelector( "a\uFFFD" ), "a\uFFFD",
		"Doesn't escape trailing replacement character" );
	assert.equal( jQuery.escapeSelector( "\uFFFDb" ), "\uFFFDb",
		"Doesn't escape leading replacement character" );
	assert.equal( jQuery.escapeSelector( "a\uFFFDb" ), "a\uFFFDb",
		"Doesn't escape embedded replacement character" );

	// Derived from CSSOM tests
	// https://test.csswg.org/harness/test/cssom-1_dev/section/7.1/

	// String conversion
	assert.equal( jQuery.escapeSelector( true ), "true", "Converts boolean true to string" );
	assert.equal( jQuery.escapeSelector( false ), "false", "Converts boolean true to string" );
	assert.equal( jQuery.escapeSelector( null ), "null", "Converts null to string" );
	assert.equal( jQuery.escapeSelector( "" ), "", "Doesn't modify empty string" );

	// Null bytes
	assert.equal( jQuery.escapeSelector( "\0" ), "\uFFFD",
		"Escapes null-character input as replacement character" );
	assert.equal( jQuery.escapeSelector( "a\0" ), "a\uFFFD",
		"Escapes trailing-null input as replacement character" );
	assert.equal( jQuery.escapeSelector( "\0b" ), "\uFFFDb",
		"Escapes leading-null input as replacement character" );
	assert.equal( jQuery.escapeSelector( "a\0b" ), "a\uFFFDb",
		"Escapes embedded-null input as replacement character" );

	// Number prefix
	assert.equal( jQuery.escapeSelector( "0a" ), "\\30 a", "Escapes leading 0" );
	assert.equal( jQuery.escapeSelector( "1a" ), "\\31 a", "Escapes leading 1" );
	assert.equal( jQuery.escapeSelector( "2a" ), "\\32 a", "Escapes leading 2" );
	assert.equal( jQuery.escapeSelector( "3a" ), "\\33 a", "Escapes leading 3" );
	assert.equal( jQuery.escapeSelector( "4a" ), "\\34 a", "Escapes leading 4" );
	assert.equal( jQuery.escapeSelector( "5a" ), "\\35 a", "Escapes leading 5" );
	assert.equal( jQuery.escapeSelector( "6a" ), "\\36 a", "Escapes leading 6" );
	assert.equal( jQuery.escapeSelector( "7a" ), "\\37 a", "Escapes leading 7" );
	assert.equal( jQuery.escapeSelector( "8a" ), "\\38 a", "Escapes leading 8" );
	assert.equal( jQuery.escapeSelector( "9a" ), "\\39 a", "Escapes leading 9" );

	// Letter-number prefix
	assert.equal( jQuery.escapeSelector( "a0b" ), "a0b", "Doesn't escape embedded 0" );
	assert.equal( jQuery.escapeSelector( "a1b" ), "a1b", "Doesn't escape embedded 1" );
	assert.equal( jQuery.escapeSelector( "a2b" ), "a2b", "Doesn't escape embedded 2" );
	assert.equal( jQuery.escapeSelector( "a3b" ), "a3b", "Doesn't escape embedded 3" );
	assert.equal( jQuery.escapeSelector( "a4b" ), "a4b", "Doesn't escape embedded 4" );
	assert.equal( jQuery.escapeSelector( "a5b" ), "a5b", "Doesn't escape embedded 5" );
	assert.equal( jQuery.escapeSelector( "a6b" ), "a6b", "Doesn't escape embedded 6" );
	assert.equal( jQuery.escapeSelector( "a7b" ), "a7b", "Doesn't escape embedded 7" );
	assert.equal( jQuery.escapeSelector( "a8b" ), "a8b", "Doesn't escape embedded 8" );
	assert.equal( jQuery.escapeSelector( "a9b" ), "a9b", "Doesn't escape embedded 9" );

	// Dash-number prefix
	assert.equal( jQuery.escapeSelector( "-0a" ), "-\\30 a", "Escapes 0 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-1a" ), "-\\31 a", "Escapes 1 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-2a" ), "-\\32 a", "Escapes 2 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-3a" ), "-\\33 a", "Escapes 3 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-4a" ), "-\\34 a", "Escapes 4 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-5a" ), "-\\35 a", "Escapes 5 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-6a" ), "-\\36 a", "Escapes 6 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-7a" ), "-\\37 a", "Escapes 7 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-8a" ), "-\\38 a", "Escapes 8 after leading dash" );
	assert.equal( jQuery.escapeSelector( "-9a" ), "-\\39 a", "Escapes 9 after leading dash" );

	// Double dash prefix
	assert.equal( jQuery.escapeSelector( "--a" ), "--a", "Doesn't escape leading double dash" );

	// Miscellany
	assert.equal( jQuery.escapeSelector( "\x01\x02\x1E\x1F" ), "\\1 \\2 \\1e \\1f ",
		"Escapes C0 control characters" );
	assert.equal( jQuery.escapeSelector( "\x80\x2D\x5F\xA9" ), "\x80\x2D\x5F\xA9",
		"Doesn't escape general punctuation or non-ASCII ISO-8859-1 characters" );
	assert.equal(
		jQuery.escapeSelector( "\x7F\x80\x81\x82\x83\x84\x85\x86\x87\x88\x89\x8A\x8B\x8C\x8D\x8E\x8F\x90" +
			"\x91\x92\x93\x94\x95\x96\x97\x98\x99\x9A\x9B\x9C\x9D\x9E\x9F" ),
		"\\7f \x80\x81\x82\x83\x84\x85\x86\x87\x88\x89\x8A\x8B\x8C\x8D\x8E\x8F\x90" +
		"\x91\x92\x93\x94\x95\x96\x97\x98\x99\x9A\x9B\x9C\x9D\x9E\x9F",
		"Escapes DEL control character"
	);
	assert.equal( jQuery.escapeSelector( "\xA0\xA1\xA2" ), "\xA0\xA1\xA2",
		"Doesn't escape non-ASCII ISO-8859-1 characters" );
	assert.equal( jQuery.escapeSelector( "a0123456789b" ), "a0123456789b",
		"Doesn't escape embedded numbers" );
	assert.equal( jQuery.escapeSelector( "abcdefghijklmnopqrstuvwxyz" ), "abcdefghijklmnopqrstuvwxyz",
		"Doesn't escape lowercase ASCII letters" );
	assert.equal( jQuery.escapeSelector( "ABCDEFGHIJKLMNOPQRSTUVWXYZ" ), "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
		"Doesn't escape uppercase ASCII letters" );
	assert.equal( jQuery.escapeSelector( "\x20\x21\x78\x79" ), "\\ \\!xy",
		"Escapes non-word ASCII characters" );

	// Astral symbol (U+1D306 TETRAGRAM FOR CENTRE)
	assert.equal( jQuery.escapeSelector( "\uD834\uDF06" ), "\uD834\uDF06",
		"Doesn't escape astral characters" );

	// Lone surrogates
	assert.equal( jQuery.escapeSelector( "\uDF06" ), "\uDF06", "Doesn't escape lone low surrogate" );
	assert.equal( jQuery.escapeSelector( "\uD834" ), "\uD834", "Doesn't escape lone high surrogate" );
} );


QUnit.test( "jQuery.proxy", function( assert ) {
	assert.expect( 9 );

	var test2, test3, test4, fn, cb,
		test = function() {
			assert.equal( this, thisObject, "Make sure that scope is set properly." );
		},
		thisObject = { foo: "bar", method: test };

	// Make sure normal works
	test.call( thisObject );

	// Basic scoping
	jQuery.proxy( test, thisObject )();

	// Another take on it
	jQuery.proxy( thisObject, "method" )();

	// Make sure it doesn't freak out
	assert.equal( jQuery.proxy( null, thisObject ), undefined, "Make sure no function was returned." );

	// Partial application
	test2 = function( a ) {
		assert.equal( a, "pre-applied", "Ensure arguments can be pre-applied." );
	};
	jQuery.proxy( test2, null, "pre-applied" )();

	// Partial application w/ normal arguments
	test3 = function( a, b ) {
		assert.equal( b, "normal", "Ensure arguments can be pre-applied and passed as usual." );
	};
	jQuery.proxy( test3, null, "pre-applied" )( "normal" );

	// Test old syntax
	test4 = { "meth": function( a ) {
			assert.equal( a, "boom", "Ensure old syntax works." );
		} };
	jQuery.proxy( test4, "meth" )( "boom" );

	// jQuery 1.9 improved currying with `this` object
	fn = function() {
		assert.equal( Array.prototype.join.call( arguments, "," ), "arg1,arg2,arg3", "args passed" );
		assert.equal( this.foo, "bar", "this-object passed" );
	};
	cb = jQuery.proxy( fn, null, "arg1", "arg2" );
	cb.call( thisObject, "arg3" );
} );

if ( includesModule( "selector" ) ) {
	QUnit[ QUnit.jQuerySelectors ? "test" : "skip" ](
		"jQuery.expr[ \":\" ], jQuery.expr.filters",
		function( assert ) {
			assert.expect( 2 );

			assert.strictEqual( jQuery.expr[ ":" ], jQuery.expr.pseudos,
				"jQuery.expr[ \":\" ] is an alias of jQuery.expr.pseudos" );
			assert.strictEqual( jQuery.expr.filters, jQuery.expr.pseudos,
				"jQuery.expr.filters is an alias of jQuery.expr.pseudos" );
		} );
}

}
