import { jQuery } from "../core.js";
import { document } from "../var/document.js";
import { dataPriv } from "../data/var/dataPriv.js";
import { acceptData } from "../data/var/acceptData.js";
import { hasOwn } from "../var/hasOwn.js";

import "../event.js";

var triggerMetadataKey = "triggerMetadata",
	focusTriggerGuardKey = "focusTriggerGuard";

function isFocusEventType( type ) {
	return type === "focus" || type === "blur" || type === "focusin" || type === "focusout";
}

function makeNamespaceRegExp( namespaces ) {
	return namespaces.length ?
		new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
		null;
}

function createNativeEvent( type ) {
	var globalObject = typeof window !== "undefined" ? window : ( document.defaultView || {} ),
		PointerCtor = globalObject.PointerEvent,
		FocusCtor = globalObject.FocusEvent,
		CustomCtor = globalObject.CustomEvent,
		focusEvent,
		bubbles = type !== "focus" && type !== "blur";

	if ( type === "click" && PointerCtor ) {
		return new PointerCtor( "click", {
			bubbles: true,
			cancelable: true
		} );
	}

	if ( isFocusEventType( type ) && FocusCtor ) {
		focusEvent = new FocusCtor( type, {
			bubbles: bubbles,
			cancelable: true
		} );
		return focusEvent;
	}

	return new CustomCtor( type, {
		bubbles: bubbles,
		cancelable: true
	} );
}

function applyTriggerMetadata( nativeEvent, metadata ) {
	dataPriv.set( nativeEvent, triggerMetadataKey, metadata );
}

function clearTriggerMetadata( nativeEvent ) {
	dataPriv.remove( nativeEvent, triggerMetadataKey );
}

function dispatchNative(
	elem,
	nativeEvent,
	data,
	namespaceString,
	rnamespace,
	isTrigger,
	manual,
	triggerProps
) {
	var metadata = {
		data: data,
		namespaceString: namespaceString,
		rnamespace: rnamespace,
		isTrigger: isTrigger,
		manual: manual,
		triggerProps: triggerProps,
		result: undefined
	};

	applyTriggerMetadata(
		nativeEvent,
		metadata
	);
	try {
		elem.dispatchEvent( nativeEvent );
	} finally {
		clearTriggerMetadata( nativeEvent );
	}

	return metadata.result;
}

jQuery.extend( jQuery.event, {

	trigger: function( event, data, elem, onlyHandlers ) {

		var namespaceString, namespaces,
			rnamespace, special, delegateType,
			explicitEventObject,
			eventProp,
			ontype, handle,
			nativeEvent, companionEvent,
			result, companionResult,
			submitTarget,
			guardDepth,
			type = hasOwn.call( event, "type" ) ? event.type : event,
			triggerData = data == null ? [] : jQuery.makeArray( data );

		elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		namespaces = hasOwn.call( event, "namespace" ) ?
			event.namespace.split( "." ) :
			[];

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}

		namespaceString = namespaces.join( "." );
		rnamespace = makeNamespaceRegExp( namespaces );
		explicitEventObject = hasOwn.call( event, "type" );
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		special = jQuery.event.special[ type ] || {};

		if ( onlyHandlers ) {
			if ( explicitEventObject ) {
				nativeEvent = event[ jQuery.expando ] ? event : new jQuery.Event( type, event );
				nativeEvent.type = type;
				nativeEvent.isTrigger = 2;
				nativeEvent.namespace = namespaceString;
				nativeEvent.rnamespace = rnamespace;
				nativeEvent.result = undefined;
				if ( !nativeEvent.target ) {
					nativeEvent.target = elem;
				}

				nativeEvent.result = jQuery.event.dispatch.apply(
					elem,
					[ nativeEvent ].concat( triggerData )
				);
				return nativeEvent.result;
			}

			nativeEvent = new jQuery.Event( type );
			nativeEvent.isTrigger = 2;
			nativeEvent.namespace = namespaceString;
			nativeEvent.rnamespace = rnamespace;
			nativeEvent.target = elem;
			nativeEvent.result = jQuery.event.dispatch.apply(
				elem,
				[ nativeEvent ].concat( triggerData )
			);

			handle = ontype && elem[ ontype ];
			if ( handle && handle.apply && acceptData( elem ) ) {
				handle = handle.apply( elem, [ nativeEvent ].concat( triggerData ) );
				if ( handle !== undefined ) {
					nativeEvent.result = handle;
					if ( handle === false ) {
						nativeEvent.preventDefault();
					}
				}
			}

			return nativeEvent.result;
		}

		if ( !elem.dispatchEvent ) {
			return;
		}

		if ( explicitEventObject ) {
			if (
				event[ jQuery.expando ] &&
				event.isPropagationStopped &&
				event.isPropagationStopped()
			) {
				return event.result;
			}

			nativeEvent = event[ jQuery.expando ] ?
				null :
				( event.originalEvent || ( event.target ? event : null ) );

			if ( !nativeEvent || nativeEvent[ jQuery.expando ] ) {
				nativeEvent = createNativeEvent( type );

				for ( eventProp in event ) {
					if ( eventProp === "type" || eventProp === jQuery.expando ) {
						continue;
					}

					try {
						nativeEvent[ eventProp ] = event[ eventProp ];
					} catch ( ignored ) {
					}
				}
			}

			result = dispatchNative(
				elem,
				nativeEvent,
				triggerData,
				namespaceString,
				rnamespace,
				3,
				true,
				event
			);

			if ( event && typeof event === "object" ) {
				event.result = result;
			}

			return result;
		}

		delegateType = special.delegateType;

		if ( type === "focus" || type === "blur" ) {
			if ( typeof elem[ type ] === "function" ) {
				if ( triggerData.length ) {
					jQuery.event.focusTriggerGuard = ( jQuery.event.focusTriggerGuard || 0 ) + 1;
					guardDepth = dataPriv.get( elem, focusTriggerGuardKey ) || 0;
					dataPriv.set( elem, focusTriggerGuardKey, guardDepth + 1 );
				}
				try {
					elem[ type ]();
				} finally {
					if ( triggerData.length ) {
						jQuery.event.focusTriggerGuard = Math.max(
							( jQuery.event.focusTriggerGuard || 1 ) - 1,
							0
						);
						guardDepth = ( dataPriv.get( elem, focusTriggerGuardKey ) || 1 ) - 1;
						if ( guardDepth > 0 ) {
							dataPriv.set( elem, focusTriggerGuardKey, guardDepth );
						} else {
							dataPriv.remove( elem, focusTriggerGuardKey );
						}
					}
				}
			}

			if ( !triggerData.length ) {
				return;
			}

			nativeEvent = new jQuery.Event( type );
			nativeEvent.isTrigger = 3;
			nativeEvent.namespace = namespaceString;
			nativeEvent.rnamespace = rnamespace;
			nativeEvent.target = elem;
			result = jQuery.event.dispatch.apply(
				elem,
				[ nativeEvent ].concat( triggerData )
			);

			companionEvent = createNativeEvent( type === "focus" ? "focusin" : "focusout" );
			companionResult = dispatchNative(
				elem,
				companionEvent,
				triggerData,
				namespaceString,
				rnamespace,
				3,
				true
			);

			return companionResult !== undefined ?
				companionResult :
				result;
		}

		nativeEvent = createNativeEvent( type );

		if ( type === "click" && elem.nodeName && elem.nodeName.toLowerCase() === "a" ) {
			nativeEvent.preventDefault();
		}

		result = dispatchNative(
			elem,
			nativeEvent,
			triggerData,
			namespaceString,
			rnamespace,
			3,
			true
		);

		if ( type === "submit" && !nativeEvent.defaultPrevented ) {
			submitTarget = elem;

			if ( submitTarget.nodeName && submitTarget.nodeName.toLowerCase() !== "form" ) {
				submitTarget = submitTarget.form;
			}

			if ( submitTarget && typeof submitTarget.submit === "function" ) {
				submitTarget.submit();
			}
		}

		if ( delegateType && delegateType !== type && !isFocusEventType( type ) ) {
			companionEvent = createNativeEvent( delegateType );
			companionResult = dispatchNative(
				elem,
				companionEvent,
				triggerData,
				namespaceString,
				rnamespace,
				3,
				true
			);
			return companionResult !== undefined ? companionResult : result;
		}

		return result;
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

	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );
