import { jQuery } from "./core.js";
import { documentElement } from "./var/documentElement.js";
import { rnothtmlwhite } from "./var/rnothtmlwhite.js";
import { rcheckableType } from "./var/rcheckableType.js";
import { slice } from "./var/slice.js";
import { dataPriv } from "./data/var/dataPriv.js";
import { acceptData } from "./data/var/acceptData.js";
import { nodeName } from "./core/nodeName.js";

import "./core/init.js";
import "./selector.js";

var rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

// ============================================================================
// HELPER: Normalize EventListenerOptions to a consistent object form.
// This ensures we can reliably compare options when adding/removing listeners.
// The browser accepts both boolean (for capture) and object forms, but we
// normalize to object form internally for consistency.
// ============================================================================
function normalizeOptions( options ) {

	// No options provided - return undefined (falsy) to indicate default behavior.
	// This allows simple checks like `if ( options )` to skip options handling.
	if ( options == null ) {
		return undefined;
	}

	// Boolean form: addEventListener(type, fn, true) means capture: true
	// Convert to object form for internal consistency.
	if ( typeof options === "boolean" ) {
		return { capture: options };
	}

	// Already an object - return a shallow copy with only recognized properties.
	// We only copy properties that are part of the AddEventListenerOptions spec:
	// - capture: boolean - whether to use capture phase
	// - passive: boolean - whether handler will never call preventDefault()
	// - once: boolean - whether handler should be auto-removed after first invocation
	// Note: We don't copy `signal` (AbortSignal) as jQuery manages removal itself.
	var normalized = {};
	if ( options.capture !== undefined ) {
		normalized.capture = !!options.capture;
	}
	if ( options.passive !== undefined ) {
		normalized.passive = !!options.passive;
	}
	if ( options.once !== undefined ) {
		normalized.once = !!options.once;
	}

	// Return undefined if no recognized options were set.
	// This keeps the common case (no options) efficient.
	return Object.keys( normalized ).length ? normalized : undefined;
}

// ============================================================================
// HELPER: Compare two normalized options objects for equality.
// Used when removing event listeners - removeEventListener must be called with
// the same options (specifically `capture`) that were used in addEventListener.
// ============================================================================
function optionsMatch( opts1, opts2 ) {

	// Both falsy (undefined/null) means both use defaults - they match.
	if ( !opts1 && !opts2 ) {
		return true;
	}

	// One falsy, one truthy - they don't match.
	if ( !opts1 || !opts2 ) {
		return false;
	}

	// Compare the capture property specifically - this is what matters for
	// removeEventListener. The passive and once properties don't affect removal.
	// However, for jQuery's internal bookkeeping, we compare all properties
	// to ensure we're removing the exact handler the user added.
	return opts1.capture === opts2.capture &&
		opts1.passive === opts2.passive &&
		opts1.once === opts2.once;
}

// ============================================================================
// HELPER: Convert normalized options back to a form suitable for addEventListener.
// Returns undefined if no options, allowing the browser to use defaults.
// ============================================================================
function optionsForBrowser( options ) {

	// No options - let browser use defaults (bubble phase, not passive).
	if ( !options ) {
		return undefined;
	}

	// Return the options object directly - modern browsers accept the object form.
	// We no longer need to support legacy browsers that only accept boolean.
	return options;
}

// ============================================================================
// HELPER: Create a native event handler wrapper for a specific jQuery handler.
//
// This factory function is used to create per-handler native event listeners.
// It captures the necessary context (elem, handleObj, special) in a closure
// to properly dispatch the event when it fires.
//
// Parameters:
//   elem      - The DOM element the handler is attached to
//   handleObj - The handler object containing selector, handler, namespace, etc.
//   special   - The special event configuration for this event type
//
// Returns:
//   A function suitable for addEventListener that dispatches to the jQuery handler
// ============================================================================
function createEventHandle( elem, handleObj, special ) {
	return function eventHandle( nativeEvent ) {

		// CRITICAL: Check if this event type is currently being triggered via
		// jQuery.trigger(). If so, skip handling here - the trigger() function
		// already called dispatch() to handle all jQuery handlers. We don't want
		// to double-fire handlers when the native event is subsequently fired
		// via elem[type]() (e.g., elem.click(), elem.focus()).
		//
		// jQuery.event.triggered is set to the event type during the native
		// event firing portion of trigger() and cleared immediately after.
		//
		// EXCEPTION: Handlers with `namespace === false` are the leverageNative
		// controllers. These MUST run even during triggered events because they
		// implement the special checkbox/focus handling that:
		// 1. Captures the trigger data before the native event
		// 2. Re-triggers with the saved data after state changes
		// 3. Ensures namespace filtering works via the saved event's rnamespace
		// See leverageNative() for the full flow explanation.
		
		// DEBUG
		if ( nativeEvent.type === "focus" || nativeEvent.type === "blur" ) {
			console.log( "[createEventHandle] type=" + nativeEvent.type +
				" triggered=" + jQuery.event.triggered +
				" ns=" + JSON.stringify( handleObj.namespace ) +
				" check=" + ( jQuery.event.triggered === nativeEvent.type &&
					handleObj.namespace !== false ) );
		}
		
		if ( typeof jQuery !== "undefined" &&
			jQuery.event.triggered === nativeEvent.type &&
			handleObj.namespace !== false ) {
			return;
		}

		// Create a writable jQuery.Event from the native event object.
		var event = jQuery.event.fix( nativeEvent ),
			cur, ret;

		// Store handleObj on event for handler introspection and .off(event).
		event.handleObj = handleObj;
		event.data = handleObj.data;

		// For delegated events, check if the event target matches the selector.
		// If not, don't call the handler.
		if ( handleObj.selector ) {

			// Walk up from event.target to find an element matching the selector.
			cur = event.target;
			while ( cur && cur !== elem ) {
				if ( cur.nodeType === 1 &&
					jQuery.find.matchesSelector( cur, handleObj.selector ) ) {

					// Found a match - set currentTarget and call handler.
					event.currentTarget = cur;
					event.delegateTarget = elem;

					// Check namespace if event was triggered with namespace.
					if ( !event.rnamespace || handleObj.namespace === false ||
						event.rnamespace.test( handleObj.namespace ) ) {

						// Call the handler or special.handle if defined.
						ret = ( special.handle || handleObj.handler )
							.apply( cur, [ event ] );

						// If handler returns false, prevent default and stop propagation.
						if ( ret === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
					return;
				}
				cur = cur.parentNode;
			}

			// No match found in ancestor chain - don't call handler.
			return;
		}

		// Direct (non-delegated) binding - call handler on the bound element.
		event.currentTarget = elem;
		event.delegateTarget = elem;

		// Check namespace if event was triggered with namespace.
		if ( !event.rnamespace || handleObj.namespace === false ||
			event.rnamespace.test( handleObj.namespace ) ) {

			// Call the handler or special.handle if defined.
			ret = ( special.handle || handleObj.handler ).apply( elem, [ event ] );

			// If handler returns false, prevent default and stop propagation.
			if ( ret === false ) {
				event.preventDefault();
				event.stopPropagation();
			}
		}
	};
}

function on( elem, types, selector, data, fn, one ) {
	var origFn, type;

	// Types can be a map of types/handlers
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], one );
		}
		return elem;
	}

	if ( data == null && fn == null ) {

		// ( types, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn )
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

	if ( one === 1 ) {
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
		jQuery.event.add( this, types, fn, data, selector );
	} );
}

// ============================================================================
// HELPER: Internal on() that supports EventListenerOptions.
// This is the new signature that accepts options as second parameter:
//   onWithOptions( elem, types, options, selector, data, fn, one )
// ============================================================================
function onWithOptions( elem, types, options, selector, data, fn, one ) {
	var origFn, type;

	// Normalize options early - this ensures consistent handling throughout.
	options = normalizeOptions( options );

	// Types can be a map of types/handlers
	// Note: When using object form, options apply to all event types in the map.
	if ( typeof types === "object" ) {

		// ( types-Object, options, selector, data ) - but selector might not be string
		if ( typeof selector !== "string" ) {

			// ( types-Object, options, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			onWithOptions( elem, type, options, selector, data, types[ type ], one );
		}
		return elem;
	}

	// Handle various argument patterns:
	// .on( "click", { passive: true }, handler )
	// .on( "click", { passive: true }, ".selector", handler )
	// .on( "click", { passive: true }, ".selector", data, handler )
	if ( data == null && fn == null ) {

		// ( types, options, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, options, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, options, data, fn )
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

	// Handle .one() - wrap handler to auto-remove after first invocation.
	// Note: This is separate from the native `once` option. jQuery's .one()
	// works with delegation and namespaces; native `once` does not.
	// If both are used, jQuery's wrapper fires first and removes the handler.
	if ( one === 1 ) {
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

		// Pass options to jQuery.event.add() - this is the key change.
		jQuery.event.add( this, types, fn, data, selector, options );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	// ========================================================================
	// jQuery.event.add() - Attach an event handler to an element.
	//
	// NEW ARCHITECTURE (jQuery 5.0+):
	// Each call to .on() creates a SEPARATE native addEventListener call.
	// This enables support for EventListenerOptions (passive, capture, once)
	// since different options require different native listeners.
	//
	// OLD ARCHITECTURE (jQuery 4.x and earlier):
	// A single native listener was shared across all jQuery handlers for the
	// same (element, eventType) pair. jQuery maintained an internal queue and
	// dispatched to handlers itself. This prevented support for per-handler
	// options like `passive`.
	//
	// Parameters:
	//   elem     - The DOM element to attach the handler to
	//   types    - Space-separated event types, optionally with namespaces
	//   handler  - The event handler function, or an object with handler property
	//   data     - Data to pass to the handler via event.data
	//   selector - Selector for event delegation (handler fires for descendants)
	//   options  - EventListenerOptions object: { passive, capture, once }
	// ========================================================================
	add: function( elem, types, handler, data, selector, options ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData;

		// Only attach events to objects that:
		// 1. Can accept data (elements, documents, plain objects - NOT text nodes, etc.)
		// 2. Have addEventListener (DOM elements - NOT plain objects in new architecture)
		//
		// NOTE: In jQuery 5.0+, events on plain objects are no longer supported because
		// the new 1:1 handler architecture requires native addEventListener.
		//
		// Text nodes (nodeType 3) and other non-element nodes don't accept data reliably
		// (dataPriv returns fresh objects each time), which would cause infinite recursion
		// in leverageNative's setup. We explicitly reject them here.
		if ( !acceptData( elem ) || !elem.addEventListener ) {
			return;
		}

		// Get element's private data cache now that we know it accepts data.
		elemData = dataPriv.get( elem );

		// Normalize the options parameter to ensure consistent internal handling.
		// This converts boolean capture to object form and filters unknown properties.
		options = normalizeOptions( options );

		// Caller can pass in an object of custom data in lieu of the handler.
		// This is used internally (e.g., by leverageNative) to pass extra config.
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time.
		// Evaluate against documentElement in case elem is a non-element node (e.g., document).
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later.
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure if this is the first handler on this element.
		// We still maintain the events registry for:
		// 1. Cleanup when element is removed from DOM
		// 2. Namespace-based removal (e.g., .off(".namespace"))
		// 3. Selector-based removal for delegation
		// 4. Handler-based removal (removing specific function)
		if ( !( events = elemData.events ) ) {
			events = elemData.events = Object.create( null );
		}

		// Handle multiple events separated by a space (e.g., "click mouseover").
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers.
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type.
			// Example: mouseenter -> mouseover, focus -> focusin (for delegation).
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type.
			// Delegated events may use a different native event (e.g., focus -> focusin).
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type.
			special = jQuery.event.special[ type ] || {};

			// handleObj contains all the information about this specific handler binding.
			// This object is stored in the registry and passed to the handler via event.handleObj.
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." ),

				// NEW: Store the normalized options on handleObj.
				// This is essential for:
				// 1. Passing correct options to addEventListener
				// 2. Matching options when removing (removeEventListener needs same options)
				options: options
			}, handleObjIn );

			// Init the event handler queue for this event type if it doesn't exist.
			// The queue is still maintained for:
			// - Cleanup tracking
			// - Namespace/selector-based removal
			// - delegateCount for delegation optimization
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Let special.setup have first crack at setting up the event.
				// If it returns false (or doesn't exist), we proceed with addEventListener.
				if ( !special.setup ||
					special.setup.call( elem, data, namespaces, undefined ) === false ) {

					// Note: We no longer pass eventHandle to setup since each handler
					// now gets its own native listener. The setup hook is now only for
					// special initialization that should happen once per element/type.
				}
			}

			// ================================================================
			// NEW: Create a per-handler native event listener.
			// This is the key architectural change that enables EventListenerOptions.
			// Each jQuery handler gets its own native addEventListener call.
			// ================================================================

			// Create the native event handler wrapper for this specific jQuery handler.
			// Uses createEventHandle factory to avoid creating function in loop.
			eventHandle = handleObj.eventHandle = createEventHandle( elem, handleObj, special );

			// Store element reference on the handle for cleanup.
			eventHandle.elem = elem;
			eventHandle.elem = elem;

			// Call the special.add hook if defined (e.g., for mouseenter/mouseleave).
			if ( special.add ) {
				special.add.call( elem, handleObj );

				// Ensure the handler has a guid for removal.
				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list.
			// Delegates go in front for proper ordering during dispatch.
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// ================================================================
			// NEW: Attach the native event listener with options.
			// This is called for EVERY handler, not just the first one.
			// The options parameter enables passive/capture/once support.
			// ================================================================
			elem.addEventListener( type, eventHandle, optionsForBrowser( options ) );
		}
	},

	// ========================================================================
	// jQuery.event.remove() - Detach event handlers from an element.
	//
	// NEW ARCHITECTURE (jQuery 5.0+):
	// Since each handler now has its own native addEventListener, we must call
	// removeEventListener for each handler being removed. The options (specifically
	// `capture`) must match what was passed to addEventListener.
	//
	// Parameters:
	//   elem        - The DOM element to remove handlers from
	//   types       - Space-separated event types, optionally with namespaces
	//   handler     - Specific handler function to remove (optional)
	//   selector    - Selector for delegated handlers to remove (optional)
	//   mappedTypes - Internal flag for recursive calls with mapped types
	//   options     - EventListenerOptions to match (optional, for precise removal)
	// ========================================================================
	remove: function( elem, types, handler, selector, mappedTypes, options ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
			return;
		}

		// Normalize options for matching against stored handleObj.options.
		options = normalizeOptions( options );

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
					jQuery.event.remove( elem, type + types[ t ], handler,
						selector, true, options );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				// Check all matching criteria:
				// 1. Type must match (or mappedTypes flag allows any origType)
				// 2. Handler guid must match (if handler specified)
				// 3. Namespace must match (if namespace specified)
				// 4. Selector must match (if selector specified)
				// 5. NEW: Options must match (if options specified)
				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) &&
					( !options || optionsMatch( options, handleObj.options ) ) ) {

					// Remove from the handlers array.
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}

					// ============================================================
					// NEW: Remove the native event listener for this specific handler.
					// This is critical - each handler has its own addEventListener,
					// so each must be removed individually with matching options.
					// We use jQuery.removeEvent for backward compatibility with code
					// that monkey-patches it (e.g., for testing or instrumentation).
					// ============================================================
					if ( handleObj.eventHandle ) {
						jQuery.removeEvent(
							elem,
							handleObj.type,
							handleObj.eventHandle,
							handleObj.options
						);
					}

					// Call special.remove hook if defined.
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist.
			// With the new architecture, we don't have a shared handler to remove,
			// but we still clean up the handlers array and call teardown.
			if ( origCount && !handlers.length ) {
				if ( !special.teardown ||
					special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

					// Note: With new architecture, jQuery.removeEvent is no longer
					// needed for normal cleanup since each handler removes its own
					// native listener above. This call is kept for special.teardown
					// compatibility and edge cases.
				}

				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "handle events" );
		}
	},

	// ========================================================================
	// jQuery.event.dispatch() - Dispatch jQuery events to handlers.
	//
	// NEW ARCHITECTURE NOTE (jQuery 5.0+):
	// For NATIVE events, this function is NO LONGER CALLED. Each handler's
	// eventHandle wrapper (created in jQuery.event.add) dispatches directly.
	//
	// This function is STILL USED for:
	// 1. .trigger() and .triggerHandler() - synthetic event dispatch
	// 2. Special event handlers that need centralized dispatch
	//
	// The handler queue logic is preserved for these use cases.
	// ========================================================================
	dispatch: function( nativeEvent ) {

		var i, j, ret, matched, handleObj, handlerQueue,
			args = new Array( arguments.length ),

			// Make a writable jQuery.Event from the native event object
			event = jQuery.event.fix( nativeEvent ),

			handlers = (
				dataPriv.get( this, "events" ) || Object.create( null )
			)[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( ( handleObj = matched.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// If the event is namespaced, then each handler is only invoked if it is
				// specially universal or its namespaces are a superset of the event's.
				if ( !event.rnamespace || handleObj.namespace === false ||
					event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

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
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

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
		if ( delegateCount < handlers.length ) {
			handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
		}

		return handlerQueue;
	},

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

	fix: function( originalEvent ) {
		return originalEvent[ jQuery.expando ] ?
			originalEvent :
			new jQuery.Event( originalEvent );
	},

	special: jQuery.extend( Object.create( null ), {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {

			// Utilize native event to ensure correct state for checkable inputs
			setup: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Claim the first handler
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					// dataPriv.set( el, "click", ... )
					leverageNative( el, "click", true );
				}

				// Return false to allow normal processing in the caller
				return false;
			},
			trigger: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Force setup before triggering a click
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					leverageNative( el, "click" );
				}

				// Return non-false to allow normal event-path propagation
				return true;
			},

			// For cross-browser consistency, suppress native .click() on links
			// Also prevent it if we're currently inside a leveraged native-event stack
			_default: function( event ) {
				var target = event.target;
				return rcheckableType.test( target.type ) &&
					target.click && nodeName( target, "input" ) &&
					dataPriv.get( target, "click" ) ||
					nodeName( target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {
				if ( event.result !== undefined ) {

					// Setting `event.originalEvent.returnValue` in modern
					// browsers does the same as just calling `preventDefault()`,
					// the browsers ignore the value anyway.
					event.preventDefault();
				}
			}
		}
	} )
};

// Ensure the presence of an event listener that handles manually-triggered
// synthetic events by interrupting progress until reinvoked in response to
// *native* events that it fires directly, ensuring that state changes have
// already occurred before other listeners are invoked.
function leverageNative( el, type, isSetup ) {

	// Missing `isSetup` indicates a trigger call, which must force setup through jQuery.event.add
	if ( !isSetup ) {
		if ( dataPriv.get( el, type ) === undefined ) {
			jQuery.event.add( el, type, returnTrue );
		}
		return;
	}

	// Register the controller as a special universal handler for all event namespaces
	dataPriv.set( el, type, false );
	jQuery.event.add( el, type, {
		namespace: false,
		handler: function( event ) {
			var result,
				saved = dataPriv.get( this, type );

			// This controller function is invoked under multiple circumstances,
			// differentiated by the stored value in `saved`:
			// 1. For an outer synthetic `.trigger()`ed event (detected by
			//    `event.isTrigger & 1` and `saved === false`), it records arguments
			//    as an array and fires an [inner] native event to prompt state
			//    changes that should be observed by registered listeners (such as
			//    checkbox toggling and focus updating), then clears the stored value.
			// 2. For an [inner] native event (detected by `saved` being
			//    an array), it triggers an inner synthetic event, records the
			//    result, and preempts propagation to further jQuery listeners.
			// 3. For an inner synthetic event (detected by `event.isTrigger & 1` and
			//    array `saved`), it prevents double-propagation of surrogate events
			//    but otherwise allows everything to proceed (particularly including
			//    further listeners).
			// Possible `saved` data shapes: `[...], `{ value }`, `false`.
			//
			// NOTE: We use `saved === false` instead of `!saved.length` because
			// `{ value: x }.length` is also undefined, which would incorrectly
			// match case 1 when we're actually in a re-entrant situation where
			// the result was already captured. This is exposed in jQuery 5.0+
			// where per-handler wrappers may be called multiple times for the
			// same native event (e.g., Firefox's double-blur behavior).
			if ( ( event.isTrigger & 1 ) && this[ type ] ) {

				// Interrupt processing of the outer synthetic .trigger()ed event
				if ( saved === false ) {

					// Store arguments for use when handling the inner native event
					// There will always be at least one argument (an event object),
					// so this array will not be confused with a leftover capture object.
					saved = slice.call( arguments );
					dataPriv.set( this, type, saved );

					// Trigger the native event and capture its result.
					// CRITICAL (jQuery 5.0+): Set jQuery.event.triggered to prevent
					// per-handler wrappers from firing during this native event.
					// This ensures namespace filtering works correctly with namespaced
					// .trigger() calls on leverageNative-enabled events (like checkbox clicks).
					jQuery.event.triggered = type;
					if ( type === "focus" || type === "blur" ) {
						console.log( "[leverageNative] BEFORE this." + type + "() - triggered=" +
							jQuery.event.triggered );
					}
					this[ type ]();
					if ( type === "focus" || type === "blur" ) {
						console.log( "[leverageNative] AFTER this." + type + "() - triggered=" +
							jQuery.event.triggered );
					}
					jQuery.event.triggered = undefined;

					result = dataPriv.get( this, type );
					dataPriv.set( this, type, false );

					if ( saved !== result ) {

						// Cancel the outer synthetic event
						event.stopImmediatePropagation();
						event.preventDefault();

						// Support: Chrome 86+
						// In Chrome, if an element having a focusout handler is
						// blurred by clicking outside of it, it invokes the handler
						// synchronously. If that handler calls `.remove()` on
						// the element, the data is cleared, leaving `result`
						// undefined. We need to guard against this.
						return result && result.value;
					}

				// If this is an inner synthetic event for an event with a bubbling
				// surrogate (focus or blur), assume that the surrogate already
				// propagated from triggering the native event and prevent that
				// from happening again here.
				} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
					event.stopPropagation();
				}

			// If this is a native event triggered above, everything is now in order.
			// Fire an inner synthetic event with the original arguments.
			} else if ( saved.length ) {

				// ...and capture the result
				dataPriv.set( this, type, {
					value: jQuery.event.trigger(
						saved[ 0 ],
						saved.slice( 1 ),
						this
					)
				} );

				// Abort handling of the native event by all jQuery handlers while allowing
				// native handlers on the same element to run. On target, this is achieved
				// by stopping immediate propagation just on the jQuery event. However,
				// the native event is re-wrapped by a jQuery one on each level of the
				// propagation so the only way to stop it for jQuery is to stop it for
				// everyone via native `stopPropagation()`. This is not a problem for
				// focus/blur which don't bubble, but it does also stop click on checkboxes
				// and radios. We accept this limitation.
				event.stopPropagation();
				event.isImmediatePropagationStopped = returnTrue;

			// If saved is a result object ({ value: ... }), this is a duplicate
			// native event call (e.g., Firefox's double blur bug, or the test patch).
			// The event was already processed, so just stop propagation to prevent
			// user handlers from firing again.
			// Note: We check for an object with 'value' property (even if undefined)
			// rather than checking the value itself, since trigger() may return undefined.
			} else if ( saved && typeof saved === "object" && "value" in saved ) {
				event.stopPropagation();
				event.isImmediatePropagationStopped = returnTrue;
			}
		}
	} );
}

// ============================================================================
// jQuery.removeEvent() - Low-level native event removal.
//
// NEW ARCHITECTURE NOTE (jQuery 5.0+):
// This function is DEPRECATED for normal use. With the new 1:1 handler model,
// each handler removes its own native listener in jQuery.event.remove().
//
// This function is kept for:
// 1. Backward compatibility with special event teardown hooks
// 2. Direct low-level usage (discouraged)
// 3. Edge cases in event/trigger.js
//
// Parameters:
//   elem    - DOM element
//   type    - Event type
//   handle  - The native event handler function
//   options - EventListenerOptions (NEW: required for correct removal)
// ============================================================================
jQuery.removeEvent = function( elem, type, handle, options ) {

	// Only DOM elements have removeEventListener.
	// Plain objects are no longer supported for events.
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, optionsForBrowser( options ) );
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

jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {

	jQuery.event.special[ type ] = {

		// Utilize native event if possible so blur/focus sequence is correct
		setup: function() {

			// Claim the first handler
			// dataPriv.set( this, "focus", ... )
			// dataPriv.set( this, "blur", ... )
			leverageNative( this, type, true );

			// Return false to allow normal processing in the caller
			return false;
		},
		trigger: function() {

			// Force setup before trigger
			leverageNative( this, type );

			// Return non-false to allow normal event-path propagation
			return true;
		},

		teardown: function() {

			// Return false to indicate standard teardown should be applied
			return false;
		},

		// Suppress native focus or blur if we're currently inside
		// a leveraged native-event stack
		_default: function( event ) {
			return dataPriv.get( event.target, type );
		},

		delegateType: delegateType
	};
} );

// Create mouseenter/leave events using mouseover/out and event-time checks
// so that event delegation works in jQuery.
// Do the same for pointerenter/pointerleave and pointerover/pointerout
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

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

jQuery.fn.extend( {

	// ========================================================================
	// .on() - Attach event handlers to elements.
	//
	// NEW SIGNATURES (jQuery 5.0+):
	// In addition to existing signatures, .on() now accepts EventListenerOptions
	// as the second parameter to enable passive, capture, and once options:
	//
	//   .on( types, options, handler )
	//   .on( types, options, selector, handler )
	//   .on( types, options, selector, data, handler )
	//   .on( types, options, data, handler )
	//
	// Where `options` is an object like { passive: true, capture: false, once: true }
	//
	// EXISTING SIGNATURES (still supported):
	//   .on( types, handler )
	//   .on( types, selector, handler )
	//   .on( types, selector, data, handler )
	//   .on( types, data, handler )
	//   .on( eventsMap )
	//   .on( eventsMap, selector )
	//   .on( eventsMap, selector, data )
	//
	// The function detects whether the second argument is an options object
	// by checking for the presence of passive, capture, or once properties.
	// ========================================================================
	on: function( types, selector, data, fn ) {

		// Detect if second argument is EventListenerOptions.
		// Options objects have passive, capture, or once properties.
		// This is distinct from event data objects or selectors.
		if ( selector != null && typeof selector === "object" &&
			!selector.preventDefault &&  // Not a jQuery.Event
			( "passive" in selector || "capture" in selector || "once" in selector ) ) {

			// .on( types, options, ... )
			// Shift arguments: selector is actually options, data becomes selector, etc.
			return onWithOptions( this, types, selector, data, fn, arguments[ 4 ] );
		}

		// No options - use original signature.
		return on( this, types, selector, data, fn );
	},

	// ========================================================================
	// .one() - Attach event handlers that fire at most once per element.
	//
	// NEW SIGNATURES (jQuery 5.0+):
	// Same as .on() - accepts EventListenerOptions as second parameter.
	//
	// NOTE: jQuery's .one() is different from native { once: true }:
	// - jQuery's .one() works with delegation and removes after first match
	// - Native once removes the listener after first invocation regardless
	// - If you use both, jQuery's wrapper fires first and removes the handler
	// ========================================================================
	one: function( types, selector, data, fn ) {

		// Detect if second argument is EventListenerOptions.
		if ( selector != null && typeof selector === "object" &&
			!selector.preventDefault &&
			( "passive" in selector || "capture" in selector || "once" in selector ) ) {

			// .one( types, options, ... )
			return onWithOptions( this, types, selector, data, fn, arguments[ 4 ], 1 );
		}

		// No options - use original signature.
		return on( this, types, selector, data, fn, 1 );
	},

	// ========================================================================
	// .off() - Remove event handlers from elements.
	//
	// NEW SIGNATURES (jQuery 5.0+):
	// .off() now accepts EventListenerOptions to precisely match handlers:
	//
	//   .off( types, options )
	//   .off( types, options, handler )
	//   .off( types, options, selector, handler )
	//
	// This is important because handlers with different options (e.g., passive
	// vs non-passive) are separate native listeners. To remove a specific one,
	// you may need to specify the options.
	//
	// If options are not specified, ALL handlers for the type are removed
	// regardless of their options.
	// ========================================================================
	off: function( types, selector, fn ) {
		var handleObj, type, options;

		// .off( event ) - Remove handler using event object from callback.
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event ) dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler,
				handleObj.options  // NEW: Pass options for precise removal
			);
			return this;
		}

		// .off( eventsMap [, selector] ) - Remove multiple handlers.
		if ( typeof types === "object" && !types.preventDefault ) {

			// Check if this is an options object rather than an events map.
			if ( "passive" in types || "capture" in types || "once" in types ) {

				// .off( options ) - invalid, options without types.
				// Just return this (no-op).
				return this;
			}

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}

		// Detect if second argument is EventListenerOptions.
		if ( selector != null && typeof selector === "object" &&
			( "passive" in selector || "capture" in selector || "once" in selector ) ) {

			// .off( types, options [, handler] )
			// .off( types, options, selector, handler )
			options = selector;

			// Shift remaining arguments.
			if ( typeof fn === "string" ) {

				// .off( types, options, selector, handler )
				// fn is selector, arguments[3] is handler
				return this.each( function() {
					jQuery.event.remove( this, types, arguments[ 3 ], fn, false, options );
				} );
			}

			// .off( types, options [, handler] )
			// fn is handler (or undefined)
			return this.each( function() {
				jQuery.event.remove( this, types, fn, undefined, false, options );
			} );
		}

		// Original signatures without options.
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
