import { jQuery } from "../core.js";
import { document } from "../var/document.js";
import { dataPriv } from "../data/var/dataPriv.js";
import { acceptData } from "../data/var/acceptData.js";
import { hasOwn } from "../var/hasOwn.js";
import { isWindow } from "../var/isWindow.js";

import "../event.js";

// ============================================================================
// Event Trigger Module
//
// NEW ARCHITECTURE NOTE (jQuery 5.0+):
// With the new 1:1 handler model, native events dispatch directly to each
// handler's wrapper. However, .trigger() still needs to manually dispatch
// to all handlers since it creates synthetic events that don't go through
// the browser's event system.
//
// Key changes:
// - No longer uses elemData.handle (shared handler removed)
// - Calls jQuery.event.dispatch directly for synthetic event dispatch
// - Works with the handlers stored in elemData.events
// ============================================================================

var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	stopPropagationCallback = function( e ) {
		e.stopPropagation();
	};

jQuery.extend( jQuery.event, {

	// ========================================================================
	// jQuery.event.trigger() - Programmatically trigger events.
	//
	// This function creates a synthetic jQuery.Event and dispatches it to
	// all registered handlers. Unlike native events (which now dispatch
	// individually to each handler), triggered events use the centralized
	// dispatch function to maintain proper handler ordering and propagation.
	//
	// Parameters:
	//   event       - Event type string, or jQuery.Event/object with type property
	//   data        - Additional data to pass to handlers
	//   elem        - Element to trigger on (defaults to document)
	//   onlyHandlers - If true, don't trigger native event or default action
	// ========================================================================
	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, special, lastElement,
			handlers, nativeHandle,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document;

		// Don't do events on text and comment nodes.
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now.
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle().
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string.
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true).
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused.
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list.
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines.
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (trac-9951).
		// Bubble up to document, then to window; watch for a global ownerDocument var (trac-9724).
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM).
			if ( tmp === ( elem.ownerDocument || document ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path.
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// ================================================================
			// UPDATED: jQuery handler dispatch for new architecture.
			//
			// Previously we called elemData.handle which was a shared dispatcher.
			// Now we call jQuery.event.dispatch directly, which iterates through
			// all handlers in the registry for this element/type.
			//
			// This is only used for .trigger() - native events dispatch directly
			// to each handler's individual wrapper.
			// ================================================================
			handlers = ( dataPriv.get( cur, "events" ) || Object.create( null ) )[ event.type ];
			if ( handlers && handlers.length ) {

				// Call dispatch with the element as context.
				// dispatch() handles delegation, namespaces, and handler iteration.
				// Pass the event and any additional data as arguments.
				jQuery.event.dispatch.apply( cur, data );
			}

			// Native handler (onclick, etc.) - still check these.
			nativeHandle = ontype && cur[ ontype ];
			if ( nativeHandle && nativeHandle.apply && acceptData( cur ) ) {
				event.result = nativeHandle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now.
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( eventPath.pop(), data ) === false ) &&
				acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (trac-6170).
				if ( ontype && typeof elem[ type ] === "function" && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method.
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above.
					jQuery.event.triggered = type;

					if ( event.isPropagationStopped() ) {
						lastElement.addEventListener( type, stopPropagationCallback );
					}

					elem[ type ]();

					if ( event.isPropagationStopped() ) {
						lastElement.removeEventListener( type, stopPropagationCallback );
					}

					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// ========================================================================
	// jQuery.event.simulate() - Simulate an event using another event's data.
	//
	// Used internally for focus/blur -> focusin/focusout simulation.
	// Creates a synthetic event with isSimulated: true flag.
	// ========================================================================
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

	// ========================================================================
	// .trigger() - Trigger an event on matched elements.
	//
	// Executes all handlers and behaviors attached to the matched elements
	// for the given event type. Also triggers the native event if applicable.
	// ========================================================================
	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},

	// ========================================================================
	// .triggerHandler() - Trigger handlers without native event or bubbling.
	//
	// Only triggers handlers on the first matched element.
	// Does not trigger native event or default action.
	// Does not bubble up the DOM.
	// ========================================================================
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );
