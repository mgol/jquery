import { jQuery } from "../core.js";
import { document } from "../var/document.js";
import { dataPriv } from "../data/var/dataPriv.js";
import { hasOwn } from "../var/hasOwn.js";
import { isWindow } from "../var/isWindow.js";

import "../event.js";

// ============================================================================
// EVENT TRIGGERING - REFACTORED FOR 1:1 NATIVE BINDING
// ============================================================================
//
// With the new 1:1 native binding architecture, trigger() is simplified:
//
// 1. For elements, we use native dispatchEvent() with a CustomEvent or Event
//    This naturally handles bubbling and lets native handlers see the event
//
// 2. The jQuery.Event wrapper is created and cached on the native event
//    so all handlers (jQuery and native) can access jQuery-specific properties
//
// 3. We no longer need the complex triggered flag or leverageNative dance
//    since each handler has its own native listener
//
// ============================================================================

jQuery.extend( jQuery.event, {

	/**
	 * Trigger an event on an element.
	 *
	 * ARCHITECTURAL CHANGES from old implementation:
	 * - Uses native dispatchEvent() instead of manual bubbling simulation
	 * - Creates CustomEvent for custom events, Event for standard DOM events
	 * - jQuery.Event wrapper is cached on the native event via dataPriv
	 * - Removed jQuery.event.triggered flag (no longer needed)
	 *
	 * @param {string|jQuery.Event|Event} event - Event type or event object
	 * @param {*} data - Additional data to pass to handlers
	 * @param {Element} elem - Target element (defaults to document)
	 * @param {boolean} onlyHandlers - If true, don't trigger default actions
	 * @returns {*} - The result of the last handler
	 */
	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
			nativeEvent, isStandardEvent, cacheKey, cancelled, eventPath,
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		// If it's already a jQuery.Event, we'll use it; otherwise create one
		if ( event[ jQuery.expando ] ) {

			// It's already a jQuery.Event
			event = event;
		} else {

			// Create a new jQuery.Event
			event = new jQuery.Event( type, typeof event === "object" && event );
		}

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// For elements that support dispatchEvent, use native event dispatch
		// This handles bubbling naturally and allows native handlers to participate
		if ( elem.dispatchEvent ) {

			// Check if this is a standard DOM event type
			// Standard events: click, focus, blur, submit, reset, etc.
			isStandardEvent = /^(click|dblclick|mouse\w+|key\w+|focus|blur|focusin|focusout|submit|reset|change|select|scroll|resize|load|unload|error)$/.test( type );

			// If we have extra trigger data, always use CustomEvent to pass it via detail
			// Otherwise, use Event for standard event types (better compatibility with
			// native default behaviors) and CustomEvent for custom events
			if ( data.length > 1 ) {

				// Has extra trigger data - use CustomEvent to pass it
				nativeEvent = new window.CustomEvent( type, {
					bubbles: !special.noBubble,
					cancelable: true,
					detail: data.slice( 1 )
				} );
			} else if ( isStandardEvent ) {

				// Standard event without extra data - use Event
				nativeEvent = new window.Event( type, {
					bubbles: !special.noBubble,
					cancelable: true
				} );
			} else {

				// Custom event without extra data - use CustomEvent
				nativeEvent = new window.CustomEvent( type, {
					bubbles: !special.noBubble,
					cancelable: true
				} );
			}

			// Cache the jQuery.Event on the native event so handlers can access it
			// This is how jQuery-specific properties like event.data, event.result,
			// event.namespace, etc. are made available to handlers
			cacheKey = "jqev-" + type;
			dataPriv.set( nativeEvent, cacheKey, event );

			// Also store the jQuery event's namespace info on the native event
			// so our wrapper functions can filter by namespace
			if ( event.rnamespace ) {
				nativeEvent._jQueryNamespace = event.rnamespace;
			}

			// Dispatch the native event
			// This will trigger all native listeners (including jQuery wrappers)
			// and handle bubbling automatically
			cancelled = !elem.dispatchEvent( nativeEvent );

			// Update the jQuery.Event with the native event's state
			if ( cancelled ) {
				event.isDefaultPrevented = function() {
					return true;
				};
			}

			// Call special._default if defined and default wasn't prevented
			// This allows special events to implement custom default behaviors
			// Context is window (global), args are the data array
			if ( !onlyHandlers && !event.isDefaultPrevented() && special._default ) {
				special._default.apply( window, data );
			}

			// With native dispatchEvent, the browser automatically handles default actions
			// (like form submit, link navigation, etc.) if not prevented.
			// We don't need to call elem.click()/elem.submit() manually - that would
			// cause handlers to fire twice.

			return event.result;
		}

		// Fallback for elements that don't support dispatchEvent (shouldn't happen
		// with DOM elements, but kept for safety)
		// This path manually walks the event bubbling path

		// Determine event propagation path in advance, per W3C events spec (trac-9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (trac-9724)
		eventPath = [ elem ];
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			cur = cur.parentNode;
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === ( elem.ownerDocument || document ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// Fire jQuery handlers via dispatch
			handle = dataPriv.get( cur, "events" );
			if ( handle && handle[ event.type ] ) {
				jQuery.event.dispatch.call( cur, event, data );
			}

			// Native handler (onclick, etc.)
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( lastElement, data ) === false ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (trac-6170)
				if ( ontype && typeof elem[ type ] === "function" && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					elem[ type ]();

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// Piggyback on a donor event to simulate a different one
	// Used only for `focus(in | out)` events
	simulate: function( type, elem, event ) {
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true
			}
		);

		jQuery.event.trigger( e, null, elem );
	}

} );

jQuery.fn.extend( {

	/**
	 * Execute all handlers attached to the matched elements for the given event type.
	 *
	 * @param {string|jQuery.Event} type - Event type or jQuery.Event object
	 * @param {*} data - Additional data to pass to handlers
	 * @returns {jQuery} - The jQuery collection for chaining
	 */
	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},

	/**
	 * Execute all handlers attached to the first matched element for the given event type.
	 * Does not trigger native event or default actions.
	 *
	 * @param {string|jQuery.Event} type - Event type or jQuery.Event object
	 * @param {*} data - Additional data to pass to handlers
	 * @returns {*} - The result of the last handler, or undefined
	 */
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );
