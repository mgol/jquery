import { jQuery } from "./core.js";
import { documentElement } from "./var/documentElement.js";
import { rnothtmlwhite } from "./var/rnothtmlwhite.js";
import { acceptData } from "./data/var/acceptData.js";
import { dataPriv } from "./data/var/dataPriv.js";

import "./core/init.js";
import "./selector.js";

var rtypenamespace = /^([^.]*)(?:\.(.+)|)/,
	triggerMetadataKey = "triggerMetadata",
	nativeWrapperKey = "nativeWrapper",
	focusTriggerGuardKey = "focusTriggerGuard",
	delegateMatchCacheKey = "delegateMatchCache";

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function isListenerOptions( value ) {
	return value === true || value === false || jQuery.isPlainObject( value );
}

function normalizeListenerOptions( options ) {
	if ( options == null ) {
		return false;
	}

	if ( options === true || options === false ) {
		return options;
	}

	return {
		capture: !!options.capture,
		once: !!options.once,
		passive: !!options.passive
	};
}

function getDelegateCacheKey( elem, handleObj ) {
	var delegateId = dataPriv.get( elem, "delegateId" );

	if ( !delegateId ) {
		delegateId = jQuery.guid++;
		dataPriv.set( elem, "delegateId", delegateId );
	}

	return delegateId + "|" + handleObj.selector + "|" + ( handleObj.needsContext ? 1 : 0 );
}

function reorderDirectListeners( elem, type, handlers ) {
	var i, handleObj;

	for ( i = handlers.delegateCount; i < handlers.length; i++ ) {
		handleObj = handlers[ i ];

		if ( elem.removeEventListener && handleObj.listener ) {
			elem.removeEventListener( type, handleObj.listener, handleObj.capture );
			elem.addEventListener( type, handleObj.listener, handleObj.options );
		}
	}
}

function createNativeListener( elem, handleObj ) {
	return function( nativeEvent ) {
		var ret, cur,
			matched,
			matchedTargets,
			triggerMetadata,
			delegateCache,
			cacheKey,
			event = dataPriv.get( nativeEvent, nativeWrapperKey ) ||
				jQuery.event.fix( nativeEvent ),
			triggerData,
			mappedSpecial = jQuery.event.special[ handleObj.origType ] || {},
			args,
			invokeHandler = function( target ) {
				var previousType = event.type;

				if ( event.rnamespace && handleObj.namespace !== false &&
					!event.rnamespace.test( handleObj.namespace ) ) {
					return;
				}

				event.currentTarget = target;
				event.delegateTarget = elem;
				event.handleObj = handleObj;
				event.data = handleObj.data;

				if ( handleObj.origType && handleObj.origType !== handleObj.type ) {
					event.type = handleObj.origType;
				}

				ret = ( mappedSpecial.handle || handleObj.handler ).apply( target, args );

				event.type = previousType;

				if ( ret !== undefined ) {
					event.result = ret;
					if ( triggerMetadata ) {
						triggerMetadata.result = ret;
					}
					if ( ret === false ) {
						event.preventDefault();
						event.stopPropagation();
					}
				}
			};

		if ( handleObj.removed ) {
			return;
		}

		dataPriv.set( nativeEvent, nativeWrapperKey, event );
		triggerMetadata = dataPriv.get( nativeEvent, triggerMetadataKey );
		triggerData = triggerMetadata ? triggerMetadata.data : [];
		args = [ event ].concat( triggerData );

		if ( ( nativeEvent.type === "focus" || nativeEvent.type === "blur" ||
			nativeEvent.type === "focusin" || nativeEvent.type === "focusout" ) &&
			( dataPriv.get( elem, focusTriggerGuardKey ) || jQuery.event.focusTriggerGuard ) &&
			!( triggerMetadata && triggerMetadata.manual ) ) {
			return;
		}

		if ( event.isImmediatePropagationStopped() ) {
			return;
		}

		event.namespace = triggerMetadata ? triggerMetadata.namespaceString : "";
		event.rnamespace = triggerMetadata ? triggerMetadata.rnamespace : null;
		event.isTrigger = triggerMetadata && triggerMetadata.isTrigger;
		if ( triggerMetadata && triggerMetadata.triggerProps ) {
			jQuery.extend( event, triggerMetadata.triggerProps );
		}

		if ( handleObj.selector ) {
			if ( event.type === "click" && event.button >= 1 ) {
				return;
			}

			delegateCache = dataPriv.get( nativeEvent, delegateMatchCacheKey );
			if ( !delegateCache ) {
				delegateCache = Object.create( null );
				dataPriv.set( nativeEvent, delegateMatchCacheKey, delegateCache );
			}
			cacheKey = getDelegateCacheKey( elem, handleObj );
			matchedTargets = delegateCache[ cacheKey ];

			if ( matchedTargets === undefined ) {
				matchedTargets = [];
				for (
					cur = event.target;
					cur && cur !== elem;
					cur = cur.parentNode || elem
				) {
					if (
						cur.nodeType === 1 &&
						!( event.type === "click" && cur.disabled === true )
					) {
						matched = handleObj.needsContext ?
							jQuery( handleObj.selector, elem ).index( cur ) > -1 :
							jQuery.find( handleObj.selector, elem, null, [ cur ] ).length;

						if ( matched ) {
							matchedTargets.push( cur );
						}
					}
				}

				delegateCache[ cacheKey ] = matchedTargets;
			}

			for ( cur = 0; cur < matchedTargets.length; cur++ ) {
				invokeHandler( matchedTargets[ cur ] );
				if ( event.isPropagationStopped() ) {
					break;
				}
			}
		} else {
			invokeHandler( elem );
		}

		if ( !event.isImmediatePropagationStopped() &&
			event.isPropagationStopped() &&
			handleObj.selector ) {
			nativeEvent.stopImmediatePropagation();
		}
	};
}

function on( elem, types, selector, data, fn, one, options ) {
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
			on( elem, type, selector, data, types[ type ], one, options );
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
		jQuery.event.add( this, types, fn, data, selector, options );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	add: function( elem, types, handler, data, selector, options ) {

		var handleObjIn, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			listenerOptions,
			elemData = dataPriv.get( elem );

		// Only attach events to objects that accept data
		if ( !acceptData( elem ) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
			options = handleObjIn.options;
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

		// Init the element's event structure, if this is the first
		if ( !( events = elemData.events ) ) {
			events = elemData.events = Object.create( null );
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
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." ),
				options: normalizeListenerOptions( options )
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			listenerOptions = handleObj.options;
			handleObj.capture = typeof listenerOptions === "boolean" ?
				listenerOptions :
				!!( listenerOptions && listenerOptions.capture );

			handleObj.listener = createNativeListener( elem, handleObj );
			handleObj.removed = false;

			if ( elem.addEventListener ) {
				elem.addEventListener( type, handleObj.listener, listenerOptions );
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
				reorderDirectListeners( elem, type, handlers );
			} else {
				handlers.push( handleObj );
			}
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
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
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {
					handleObj.removed = true;
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( handleObj.listener ) {
						jQuery.removeEvent( elem, type, handleObj.listener, handleObj.capture );
					}

					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove event type bookkeeping when no handlers exist.
			if ( origCount && !handlers.length ) {
				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "events" );
		}
	},

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

jQuery.removeEvent = function( elem, type, handle, capture ) {

	// This "if" is needed for plain objects
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, capture );
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

	on: function( types, selector, data, fn ) {
		var args = Array.prototype.slice.call( arguments ),
			length,
			last,
			prev,
			hasOptions,
			options;

		last = args[ args.length - 1 ];
		prev = args[ args.length - 2 ];
		hasOptions = args.length > 1 && isListenerOptions( last ) && (
			typeof types === "object" ||
			typeof prev === "function" ||
			prev === false
		);

		if ( hasOptions ) {
			options = args.pop();
			length = args.length;
			types = args[ 0 ];
			selector = args[ 1 ];
			data = length > 2 ? args[ 2 ] : undefined;
			fn = length > 3 ? args[ 3 ] : undefined;
		}

		return on( this, types, selector, data, fn, undefined, options );
	},
	one: function( types, selector, data, fn ) {
		var args = Array.prototype.slice.call( arguments ),
			length,
			last,
			prev,
			hasOptions,
			options;

		last = args[ args.length - 1 ];
		prev = args[ args.length - 2 ];
		hasOptions = args.length > 1 && isListenerOptions( last ) && (
			typeof types === "object" ||
			typeof prev === "function" ||
			prev === false
		);

		if ( hasOptions ) {
			options = args.pop();
			length = args.length;
			types = args[ 0 ];
			selector = args[ 1 ];
			data = length > 2 ? args[ 2 ] : undefined;
			fn = length > 3 ? args[ 3 ] : undefined;
		}

		return on( this, types, selector, data, fn, 1, options );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event )  dispatched jQuery.Event
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
