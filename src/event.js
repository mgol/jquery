import { jQuery } from "./core.js";
import { documentElement } from "./var/documentElement.js";
import { rnothtmlwhite } from "./var/rnothtmlwhite.js";
import { dataPriv } from "./data/var/dataPriv.js";
import { nodeName } from "./core/nodeName.js";

import "./core/init.js";
import "./selector.js";

// ============================================================================
// EVENT SYSTEM REFACTORING FOR EventListenerOptions SUPPORT
// ============================================================================
//
// This refactored event system uses 1:1 native binding: each jQuery .on() call
// creates its own addEventListener(). This enables support for EventListenerOptions
// like { passive: true }, { capture: true }, { once: true }.
//
// Key architectural changes from the old multiplexed system:
//
// 1. OLD: One native listener per (element, eventType) dispatched to a queue
//    NEW: Each .on() call creates a separate native listener
//
// 2. OLD: jQuery maintained handler queues in dataPriv.get(elem, "events")
//    NEW: Each handler has its own wrapper stored with unique key in dataPriv
//
// 3. OLD: leverageNative handled checkbox/focus/blur state timing issues
//    NEW: With 1:1 native binding, browser handles state timing correctly
//
// 4. OLD: jQuery.Event wrapper created fresh for each dispatch
//    NEW: jQuery.Event wrapper cached on native event for sharing across handlers
//
// ============================================================================

var rtypenamespace = /^([^.]*)(?:\.(.+)|)/,

	// List of known EventListenerOptions keys - used to detect options object
	eventOptionKeys = { passive: true, capture: true, once: true };

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

/**
 * Check if an object looks like an EventListenerOptions object.
 * Returns true if it has at least one known option key.
 *
 * @param {Object} obj - The object to check
 * @returns {boolean} - True if this looks like an options object
 */
function isEventOptions( obj ) {
	if ( obj == null || typeof obj !== "object" || Array.isArray( obj ) ) {
		return false;
	}

	// Must have at least one known option key
	for ( var key in obj ) {
		if ( eventOptionKeys[ key ] ) {
			return true;
		}
	}
	return false;
}

/**
 * Internal helper function for .on() and .one()
 *
 * SIGNATURE: on( elem, types, selector, data, fn, options )
 *
 * The public API is: .on( types [, selector] [, data], handler [, options] )
 * This parallels addEventListener(type, handler, options) and keeps options
 * cleanly separated from data.
 *
 * For .one() behavior, pass { once: true } in options.
 *
 * @param {jQuery} elem - jQuery collection to bind events to
 * @param {string|Object} types - Event type(s) or event-type-to-handler map
 * @param {string} selector - Selector for event delegation
 * @param {*} data - Data to pass to handler via event.data
 * @param {Function} fn - Event handler function
 * @param {Object} options - EventListenerOptions: { passive, capture, once }
 */
function on( elem, types, selector, data, fn, options ) {
	var origFn, type;

	// Types can be a map of types/handlers
	// .on( { click: fn1, focus: fn2 }, selector, data, options )
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data, options )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data, options ) or ( types-Object, options )
			// Need to figure out if selector is data or options
			if ( isEventOptions( selector ) ) {

				// ( types-Object, options )
				options = selector;
				data = undefined;
			} else {

				// ( types-Object, data ) or ( types-Object, data, options )
				data = selector;

				// Check if third arg (data in normal position) is actually options
				if ( isEventOptions( data ) ) {
					options = data;
					data = undefined;
				}
			}
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], options );
		}
		return elem;
	}

	// Parse the various argument forms:
	// .on( types, fn )
	// .on( types, fn, options )
	// .on( types, selector, fn )
	// .on( types, selector, fn, options )
	// .on( types, data, fn )
	// .on( types, data, fn, options )
	// .on( types, selector, data, fn )
	// .on( types, selector, data, fn, options )

	if ( data == null && fn == null ) {

		// ( types, fn ) or ( types, fn, options )
		fn = selector;
		data = selector = undefined;

		// Check if there's an options argument hiding in "one" position
		// This happens when called from public API
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn ) or ( types, selector, fn, options )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn ) or ( types, data, fn, options )
			fn = data;
			data = selector;
			selector = undefined;
		}
	}

	if ( fn === false ) {
		fn = returnFalse;
	} else if ( !fn ) {
		return elem;
	}

	// Handle once option - wrap handler to remove itself after first invocation
	// We implement this ourselves rather than relying on native { once: true }
	// because we need to support delegation and namespaces properly
	if ( options && options.once ) {
		origFn = fn;
		fn = function( event ) {

			// Can use an empty set, since event contains the info
			jQuery().off( event );
			return origFn.apply( this, arguments );
		};

		// Use same guid so caller can remove using origFn
		fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
	}

	return elem.each( function() {
		jQuery.event.add( this, types, fn, data, selector, options );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 *
 * REFACTORED for EventListenerOptions support:
 * - Each .on() call creates its own native addEventListener
 * - Handler wrappers stored in dataPriv with unique keys
 * - jQuery.Event wrapper cached on native event for cross-handler sharing
 */
jQuery.event = {

	/**
	 * Add an event handler to an element.
	 *
	 * ARCHITECTURAL CHANGE: Instead of one shared native listener dispatching
	 * to a queue, each handler gets its own native listener. This enables
	 * per-handler EventListenerOptions (passive, capture, once).
	 *
	 * Data structure in dataPriv:
	 * - "events": { type: [ handleObj1, handleObj2, ... ] } - for iteration/removal
	 * - "jqhandler-{guid}-{capture}": wrapperFn - the actual function passed to addEventListener
	 *
	 * @param {Element} elem - DOM element to attach handler to
	 * @param {string} types - Space-separated event types with optional namespaces
	 * @param {Function|Object} handler - Handler function or handleObj with handler property
	 * @param {*} data - Data to pass to handler via event.data
	 * @param {string} selector - Selector for event delegation
	 * @param {Object} options - EventListenerOptions: { passive, capture, once }
	 */
	add: function( elem, types, handler, data, selector, options ) {

		var handleObjIn, tmp,
			events, t, handleObj,
			special, type, namespaces, origType,
			wrapperFn, handlerKey;

		// Require a DOM element with addEventListener (no plain objects)
		// This is a breaking change from jQuery 4.x which supported plain objects
		if ( !elem.addEventListener ) {
			return;
		}

		// Ensure options is at least an empty object for consistent handling
		options = options || {};

		// Caller can pass in an object of custom data in lieu of the handler
		// This is used internally for special event handlers
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time
		// Evaluate against documentElement in case elem is a non-element node (e.g., document)
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Initialize the element's event structure if this is the first handler
		// We still maintain an events object for iteration during removal/cloning
		if ( !( events = dataPriv.get( elem, "events" ) ) ) {
			events = {};
			dataPriv.set( elem, "events", events );
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			// e.g., mouseenter -> mouseover, focus -> focusin for delegation
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers and stored for removal
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." ),

				// Store options for removal matching and cloning
				options: options
			}, handleObjIn );

			// Initialize the handler array for this type if needed
			if ( !events[ type ] ) {
				events[ type ] = [];
			}

			// Allow special events to modify handleObj (e.g., wrap the handler)
			// This must happen BEFORE we create the wrapper function
			if ( special.add ) {
				special.add.call( elem, handleObj );

				// The add hook might have modified/wrapped the handler
				// Make sure the wrapper still has the correct guid
				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Create the wrapper function that will be passed to addEventListener
			// This wrapper:
			// 1. Creates/retrieves the jQuery.Event from the native event
			// 2. Handles event delegation (selector matching)
			// 3. Handles namespace filtering
			// 4. Invokes the user's handler
			// 5. Handles return false -> preventDefault + stopPropagation
			// 6. Stores event.result for access by subsequent handlers
			wrapperFn = createEventWrapper( elem, handleObj, special );

			// Store the wrapper with a unique key for later removal
			// Key format: "jqhandler-{guid}-{capture}" per DOM spec matching rules
			handlerKey = "jqhandler-" + handleObj.guid + "-" + ( options.capture ? "t" : "f" );

			// Store the wrapper function for removeEventListener
			// Note: Multiple handlers with same guid but different capture values
			// need different storage, so capture is part of the key
			handleObj.wrapperFn = wrapperFn;
			handleObj.handlerKey = handlerKey;

			// Add to our tracking array
			events[ type ].push( handleObj );

			// Actually attach the native event listener
			// Pass options object directly to addEventListener for full browser support
			elem.addEventListener( type, wrapperFn, options );
		}
	},

	/**
	 * Detach an event or set of events from an element.
	 *
	 * ARCHITECTURAL CHANGE: Instead of removing from a queue and maybe removing
	 * the shared native listener, we remove each handler's individual native listener.
	 *
	 * Per DOM spec, removeEventListener matches on:
	 * - type (event name)
	 * - callback (same function reference)
	 * - capture (boolean, from options.capture)
	 *
	 * passive and once are ignored for matching purposes.
	 *
	 * @param {Element} elem - DOM element to remove handler from
	 * @param {string} types - Space-separated event types with optional namespaces
	 * @param {Function} handler - Handler function to remove (optional)
	 * @param {string} selector - Selector for delegated events (optional)
	 * @param {boolean} mappedTypes - Internal flag for recursive calls
	 */
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, type, namespaces, origType;

		events = dataPriv.get( elem, "events" );
		if ( !events ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;

			if ( !events[ type ] ) {
				continue;
			}

			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = events[ type ].length;
			while ( j-- ) {
				handleObj = events[ type ][ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {

					// Remove from our tracking array
					events[ type ].splice( j, 1 );

					// Remove the native event listener
					// Per DOM spec, only type, callback, and capture matter for matching
					elem.removeEventListener(
						type,
						handleObj.wrapperFn,
						{ capture: handleObj.options.capture }
					);
				}
			}

			// Clean up empty type arrays
			if ( origCount && !events[ type ].length ) {
				delete events[ type ];
			}
		}

		// Remove data if no more events
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "events" );
		}
	},

	/**
	 * Dispatch is now simplified since each handler has its own native listener.
	 * This method is kept for compatibility with .trigger() which may need to
	 * programmatically invoke handlers.
	 *
	 * For native events, the wrapper function handles everything directly.
	 * This dispatch method is primarily used by trigger() to fire all handlers
	 * for a given element and event type.
	 *
	 * @param {Event} nativeEvent - The native DOM event object
	 * @param {Element} elem - The element to dispatch on (defaults to this)
	 * @returns {*} - The result of the last handler
	 */
	dispatch: function( nativeEvent, elem ) {

		var i, j, ret, handleObj, handlerQueue,
			args = new Array( arguments.length ),

			// Make a writable jQuery.Event from the native event object
			event = jQuery.event.fix( nativeEvent ),
			handlers;

		elem = elem || this;
		handlers = ( dataPriv.get( elem, "events" ) || Object.create( null ) )[ event.type ] || [];

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = elem;

		// Determine handlers - build queue of matching handlers
		handlerQueue = jQuery.event.handlers.call( elem, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( ret = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = ret.elem;

			j = 0;
			while ( ( handleObj = ret.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// If the event is namespaced, then each handler is only invoked if it is
				// specially universal or its namespaces are a superset of the event's.
				if ( !event.rnamespace || handleObj.namespace === false ||
					event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( ret.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		return event.result;
	},

	/**
	 * Build the handler queue for dispatch.
	 * For delegated events, walks up the DOM tree matching selectors.
	 * For direct events, returns handlers bound directly to the element.
	 *
	 * @param {jQuery.Event} event - The jQuery event object
	 * @param {Array} handlers - Array of handleObj objects for this event type
	 * @returns {Array} - Array of { elem, handlers } objects
	 */
	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			directHandlers,
			handlerQueue = [],
			delegateCount = 0,
			cur = event.target;

		// Count delegated handlers
		for ( i = 0; i < handlers.length; i++ ) {
			if ( handlers[ i ].selector ) {
				delegateCount++;
			}
		}

		// Find delegate handlers
		if ( delegateCount &&

			// Support: Firefox <=42 - 66+
			// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
			// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
			!( event.type === "click" && event.button >= 1 ) ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't check non-elements (trac-13208)
				// Don't process clicks on disabled elements (trac-6911, trac-8165, trac-11382, trac-11764)
				if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
					matchedHandlers = [];
					matchedSelectors = {};
					for ( i = 0; i < handlers.length; i++ ) {
						handleObj = handlers[ i ];

						// Skip non-delegated handlers
						if ( !handleObj.selector ) {
							continue;
						}

						// Don't conflict with Object.prototype properties (trac-13203)
						sel = handleObj.selector + " ";

						if ( matchedSelectors[ sel ] === undefined ) {
							matchedSelectors[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) > -1 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matchedSelectors[ sel ] ) {
							matchedHandlers.push( handleObj );
						}
					}
					if ( matchedHandlers.length ) {
						handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		cur = this;
		directHandlers = [];
		for ( i = 0; i < handlers.length; i++ ) {
			if ( !handlers[ i ].selector ) {
				directHandlers.push( handlers[ i ] );
			}
		}
		if ( directHandlers.length ) {
			handlerQueue.push( { elem: cur, handlers: directHandlers } );
		}

		return handlerQueue;
	},

	/**
	 * Add a property accessor to jQuery.Event.prototype.
	 * These accessors read from the originalEvent and can be overwritten.
	 *
	 * @param {string} name - Property name to add
	 * @param {Function} hook - Optional function to transform the value
	 */
	addProp: function( name, hook ) {
		Object.defineProperty( jQuery.Event.prototype, name, {
			enumerable: true,
			configurable: true,

			get: typeof hook === "function" ?
				function() {
					if ( this.originalEvent ) {
						return hook( this.originalEvent );
					}
				} :
				function() {
					if ( this.originalEvent ) {
						return this.originalEvent[ name ];
					}
				},

			set: function( value ) {
				Object.defineProperty( this, name, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: value
				} );
			}
		} );
	},

	/**
	 * Create a jQuery.Event from a native event, caching it on the native event
	 * for reuse by multiple handlers during the same event dispatch.
	 *
	 * ARCHITECTURAL CHANGE: The jQuery.Event wrapper is now cached on the native
	 * event itself (via dataPriv), so all handlers for the same native event
	 * share the same wrapper. This enables proper event.result propagation.
	 *
	 * @param {Event} originalEvent - Native DOM event object
	 * @returns {jQuery.Event} - jQuery event wrapper
	 */
	fix: function( originalEvent ) {
		var cacheKey, cached, jQueryEvent;

		// If this is already a jQuery.Event, return it
		if ( originalEvent[ jQuery.expando ] ) {
			return originalEvent;
		}

		// Check if we already have a cached jQuery.Event for this native event
		// Using the event type in the key to handle event retargeting
		cacheKey = "jqev-" + originalEvent.type;
		cached = dataPriv.get( originalEvent, cacheKey );
		if ( cached ) {
			return cached;
		}

		// Create new jQuery.Event and cache it
		jQueryEvent = new jQuery.Event( originalEvent );
		dataPriv.set( originalEvent, cacheKey, jQueryEvent );

		return jQueryEvent;
	},

	/**
	 * Special event handlers for events that need custom handling.
	 *
	 * SIMPLIFIED: With 1:1 native binding, most special event hooks are no longer
	 * needed. We keep only:
	 * - delegateType/bindType: Map event types for delegation (focus->focusin)
	 * - noBubble: Prevent bubbling for certain events (load)
	 * - handle: Custom handler logic (mouseenter/leave boundary detection)
	 * - _default: Custom default action prevention
	 *
	 * REMOVED: setup, teardown, add, remove, preDispatch, postDispatch
	 * These were needed for the multiplexed queue system and leverageNative.
	 */
	special: jQuery.extend( Object.create( null ), {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {

			// For checkboxes and radio buttons, native click changes state before
			// handlers run. With 1:1 native binding, this is handled correctly
			// by the browser - no leverageNative needed.

			// For cross-browser consistency, suppress native .click() on links
			_default: function( event ) {
				var target = event.target;
				return nodeName( target, "a" );
			}
		},

		beforeunload: {

			// Handle beforeunload by preventing default if result is set
			// With 1:1 native binding, this is handled in the wrapper function
			// but we keep _default for trigger() compatibility
			_default: function( event ) {
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	} )
};

/**
 * Create a wrapper function for a handler that will be passed to addEventListener.
 *
 * The wrapper function:
 * 1. Creates/retrieves the shared jQuery.Event from the native event
 * 2. For delegated events: checks if event.target matches the selector
 * 3. Filters by namespace if the event was triggered with a namespace
 * 4. Invokes the user's handler with proper context
 * 5. Handles return false -> preventDefault() + stopPropagation()
 * 6. Stores event.result for access by subsequent handlers
 * 7. For special events (mouseenter/leave): applies custom handle logic
 *
 * @param {Element} elem - The element the handler is bound to
 * @param {Object} handleObj - The handler object with handler, selector, etc.
 * @param {Object} special - The special event config, if any
 * @returns {Function} - The wrapper function to pass to addEventListener
 */
function createEventWrapper( elem, handleObj, special ) {
	return function eventWrapper( nativeEvent ) {
		var ret, cur, matched, args,

			// Get or create the shared jQuery.Event wrapper for this native event
			// This ensures all handlers for the same event see the same event.result, etc.
			event = jQuery.event.fix( nativeEvent );

		// Build args array: [event, ...extraData]
		// For triggered events, extra data comes from CustomEvent.detail
		// For native events, it's just [event]
		if ( nativeEvent.detail !== undefined && nativeEvent.detail !== null ) {
			args = [ event ].concat( nativeEvent.detail );
		} else {
			args = [ event ];
		}

		// Check if immediate propagation was stopped by a previous handler
		// (which called stopImmediatePropagation on the native event)
		// With 1:1 native binding, the browser handles this, but we check
		// our flag too for jQuery-level stopImmediatePropagation during trigger()
		if ( event.isImmediatePropagationStopped() ) {
			return;
		}

		// For namespaced events (from trigger), check namespace match
		// handleObj.namespace === false means "matches all namespaces"
		if ( event.rnamespace && handleObj.namespace !== false &&
			!event.rnamespace.test( handleObj.namespace ) ) {
			return;
		}

		// Handle delegated events
		if ( handleObj.selector ) {

			// Walk up from target to delegation root, checking for selector matches
			for ( cur = event.target; cur !== elem; cur = cur.parentNode || elem ) {

				// Skip non-elements and disabled elements for clicks
				if ( cur.nodeType !== 1 ||
					( event.type === "click" && cur.disabled === true ) ) {
					continue;
				}

				// Check if this element matches the selector
				matched = handleObj.needsContext ?
					jQuery( handleObj.selector, elem ).index( cur ) > -1 :
					jQuery.find.matchesSelector( cur, handleObj.selector );

				if ( matched ) {

					// Found a match - set currentTarget and invoke handler
					event.currentTarget = cur;
					event.handleObj = handleObj;
					event.data = handleObj.data;
					event.delegateTarget = elem;

					// For special events with custom handle (mouseenter/leave),
					// use the special handle function
					if ( special && special.handle ) {
						ret = special.handle.apply( cur, args );
					} else {

						// Pass the jQuery.Event and any trigger data to the handler
						ret = handleObj.handler.apply( cur, args );
					}

					// Handle return value
					if ( ret !== undefined ) {
						event.result = ret;
						if ( ret === false ) {
							nativeEvent.preventDefault();
							nativeEvent.stopPropagation();
						}
					}

					// Only match once per handler (don't fire for multiple ancestors)
					return;
				}
			}

			// No match found for delegated handler
			return;
		}

		// Direct (non-delegated) handler
		event.currentTarget = elem;
		event.handleObj = handleObj;
		event.data = handleObj.data;
		event.delegateTarget = elem;

		// For special events with custom handle (mouseenter/leave),
		// use the special handle function
		if ( special && special.handle ) {
			ret = special.handle.apply( elem, args );
		} else {

			// Pass the jQuery.Event and any trigger data to the handler
			ret = handleObj.handler.apply( elem, args );
		}

		// Handle return value
		if ( ret !== undefined ) {
			event.result = ret;
			if ( ret === false ) {
				nativeEvent.preventDefault();
				nativeEvent.stopPropagation();
			}
		}
	};
}

// ============================================================================
// REMOVED: leverageNative function
// ============================================================================
//
// The leverageNative mechanism was previously needed to handle checkbox click
// and focus/blur events correctly when using a multiplexed handler queue.
// With 1:1 native binding, the browser handles state timing correctly:
//
// - Checkbox clicks: The native click changes state before handlers run,
//   which is the correct behavior. No special handling needed.
//
// - Focus/blur: Native events fire in correct order. For delegation, we map
//   to focusin/focusout which bubble and are handled by the wrapper.
//
// ============================================================================

/**
 * Remove a native event listener from an element.
 * Simplified since we no longer need to handle plain objects.
 *
 * @param {Element} elem - DOM element
 * @param {string} type - Event type
 * @param {Function} handle - Handler function
 */
jQuery.removeEvent = function( elem, type, handle ) {
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle );
	}
};

jQuery.Event = function( src, props ) {

	// Allow instantiation without the 'new' keyword
	if ( !( this instanceof jQuery.Event ) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ?
			returnTrue :
			returnFalse;

		// Create target properties
		this.target = src.target;
		this.currentTarget = src.currentTarget;
		this.relatedTarget = src.relatedTarget;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || Date.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	constructor: jQuery.Event,
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,
	isSimulated: false,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && !this.isSimulated ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Includes all common event props including KeyEvent and MouseEvent specific props
jQuery.each( {
	altKey: true,
	bubbles: true,
	cancelable: true,
	changedTouches: true,
	ctrlKey: true,
	detail: true,
	eventPhase: true,
	metaKey: true,
	pageX: true,
	pageY: true,
	shiftKey: true,
	view: true,
	"char": true,
	code: true,
	charCode: true,
	key: true,
	keyCode: true,
	button: true,
	buttons: true,
	clientX: true,
	clientY: true,
	offsetX: true,
	offsetY: true,
	pointerId: true,
	pointerType: true,
	screenX: true,
	screenY: true,
	targetTouches: true,
	toElement: true,
	touches: true,
	which: true
}, jQuery.event.addProp );

// ============================================================================
// SPECIAL EVENTS: focus/blur
// ============================================================================
//
// focus and blur don't bubble, but focusin and focusout do. For delegation,
// we map focus -> focusin and blur -> focusout so that delegated handlers
// can catch these events as they bubble up.
//
// With 1:1 native binding, we no longer need leverageNative or complex
// setup/teardown hooks. The browser handles the event timing correctly.
//
// ============================================================================
jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {

	jQuery.event.special[ type ] = {

		// Map focus to focusin for delegation (focusin bubbles, focus doesn't)
		// Map blur to focusout for delegation (focusout bubbles, blur doesn't)
		delegateType: delegateType
	};
} );

// ============================================================================
// SPECIAL EVENTS: mouseenter/mouseleave, pointerenter/pointerleave
// ============================================================================
//
// These events don't bubble and need special handling to work with delegation.
// We map them to mouseover/mouseout and pointerover/pointerout respectively,
// then filter based on relatedTarget to only fire when entering/leaving the
// target element (not when moving between child elements).
//
// ============================================================================
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		// Custom handle function that filters mouseover/out events
		// to only fire mouseenter/leave when crossing the element boundary
		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mouseenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
} );

// ============================================================================
// PUBLIC API: jQuery.fn.on, jQuery.fn.one, jQuery.fn.off
// ============================================================================
//
// NEW SIGNATURE: .on( types [, selector] [, data], handler [, options] )
//
// The options parameter supports EventListenerOptions:
// - passive: true/false - cannot call preventDefault() (for scroll/touch performance)
// - capture: true/false - run in capture phase instead of bubble phase
// - once: true/false - automatically remove after first invocation
//
// Note: The native `once` option is NOT used because jQuery's .one() needs to
// work with delegation and namespaces. Instead, we wrap handlers ourselves.
//
// ============================================================================
jQuery.fn.extend( {

	/**
	 * Attach an event handler function for one or more events to the selected elements.
	 *
	 * @param {string|Object} types - Event type(s) or event-type-to-handler map
	 * @param {string} selector - Selector for event delegation (optional)
	 * @param {*} data - Data to pass to handler via event.data (optional)
	 * @param {Function} fn - Event handler function
	 * @param {Object} options - EventListenerOptions: { passive, capture, once }
	 * @returns {jQuery} - The jQuery collection for chaining
	 */
	on: function( types, selector, data, fn, options ) {
		return on( this, types, selector, data, fn, options );
	},

	/**
	 * Attach a handler that fires at most once per element per event type.
	 *
	 * @param {string|Object} types - Event type(s) or event-type-to-handler map
	 * @param {string} selector - Selector for event delegation (optional)
	 * @param {*} data - Data to pass to handler via event.data (optional)
	 * @param {Function} fn - Event handler function
	 * @param {Object} options - EventListenerOptions: { passive, capture }
	 * @returns {jQuery} - The jQuery collection for chaining
	 */
	one: function( types, selector, data, fn, options ) {

		// Merge once: true into options
		return on( this, types, selector, data, fn,
			jQuery.extend( {}, options, { once: true } ) );
	},

	/**
	 * Remove an event handler.
	 *
	 * @param {string|Object|jQuery.Event} types - Event type(s), map, or event object
	 * @param {string|Function} selector - Selector or handler function
	 * @param {Function} fn - Handler function to remove
	 * @returns {jQuery} - The jQuery collection for chaining
	 */
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event ) dispatched jQuery.Event
			// Remove the specific handler that handled this event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {

			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each( function() {
			jQuery.event.remove( this, types, fn, selector );
		} );
	}
} );

export { jQuery, jQuery as $ };
