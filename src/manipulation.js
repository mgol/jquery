import { jQuery } from "./core.js";
import { isAttached } from "./core/isAttached.js";
import { push } from "./var/push.js";
import { access } from "./core/access.js";
import { rtagName } from "./manipulation/var/rtagName.js";
import { wrapMap } from "./manipulation/wrapMap.js";
import { getAll } from "./manipulation/getAll.js";
import { domManip } from "./manipulation/domManip.js";
import { setGlobalEval } from "./manipulation/setGlobalEval.js";
import { dataPriv } from "./data/var/dataPriv.js";
import { dataUser } from "./data/var/dataUser.js";
import { nodeName } from "./core/nodeName.js";

import "./core/init.js";
import "./traversing.js";
import "./event.js";

var rnoInnerhtml = /<script|<style|<link/i;

// Prefer a tbody over its parent table for containing new rows
function manipulationTarget( elem, content ) {
	if ( nodeName( elem, "table" ) &&
		nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

		return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
	}

	return elem;
}

/**
 * Copy events from one element to another during cloning.
 *
 * UPDATED for 1:1 native binding architecture:
 * - Iterates through all handlers in the events object
 * - Re-attaches each handler with its original options (passive, capture, once)
 * - Each handler gets a new wrapper function via jQuery.event.add
 *
 * @param {Element} src - Source element to copy events from
 * @param {Element} dest - Destination element to copy events to
 */
function cloneCopyEvent( src, dest ) {
	var type, i, l, handleObj,
		events = dataPriv.get( src, "events" );

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( events ) {

		// Clear any existing events on destination (shouldn't be any, but safety first)
		dataPriv.remove( dest, "events" );

		// Iterate through all event types
		for ( type in events ) {

			// Iterate through all handlers for this event type
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				handleObj = events[ type ][ i ];

				// Re-add the event handler to the destination element
				// This will create a new wrapper function and attach a new native listener
				// The options (passive, capture, once) are preserved in handleObj.options
				jQuery.event.add(
					dest,
					handleObj.origType,
					handleObj.handler,
					handleObj.data,
					handleObj.selector,
					handleObj.options
				);
			}
		}
	}

	// 2. Copy user data
	if ( dataUser.hasData( src ) ) {
		dataUser.set( dest, jQuery.extend( {}, dataUser.get( src ) ) );
	}
}

function remove( elem, selector, keepData ) {
	var node,
		nodes = selector ? jQuery.filter( selector, elem ) : elem,
		i = 0;

	for ( ; ( node = nodes[ i ] ) != null; i++ ) {
		if ( !keepData && node.nodeType === 1 ) {
			jQuery.cleanData( getAll( node ) );
		}

		if ( node.parentNode ) {
			if ( keepData && isAttached( node ) ) {
				setGlobalEval( getAll( node, "script" ) );
			}
			node.parentNode.removeChild( node );
		}
	}

	return elem;
}

jQuery.extend( {
	htmlPrefilter: function( html ) {
		return html;
	},

	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = isAttached( elem );

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = getAll( elem );
				destElements = getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	/**
	 * Clean up jQuery data and events for elements being removed from the DOM.
	 *
	 * UPDATED for 1:1 native binding architecture:
	 * - Each handler has its own native listener stored in handleObj.wrapperFn
	 * - We must remove each listener individually via removeEventListener
	 * - No more shared "handle" function to worry about
	 *
	 * @param {Array} elems - Array of elements to clean
	 */
	cleanData: function( elems ) {
		var data, elem, type, handleObj, handlers, j, len,
			i = 0;

		for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {

			// Only clean elements that accept data
			if ( !elem[ dataPriv.expando ] ) {
				continue;
			}

			data = elem[ dataPriv.expando ];

			if ( data && data.events ) {

				// Remove each event handler individually
				// With 1:1 native binding, each handler has its own native listener
				for ( type in data.events ) {
					handlers = data.events[ type ];

					// Iterate through all handlers for this type
					for ( j = 0, len = handlers.length; j < len; j++ ) {
						handleObj = handlers[ j ];

						// Remove the native event listener
						// Use the stored wrapper function and capture flag
						elem.removeEventListener(
							type,
							handleObj.wrapperFn,
							{ capture: handleObj.options && handleObj.options.capture }
						);
					}
				}

				// Support: Chrome <=35 - 45+
				// Assign undefined instead of using delete, see Data#remove
				elem[ dataPriv.expando ] = undefined;
			}

			// Clean user data
			if ( elem[ dataUser.expando ] ) {

				// Support: Chrome <=35 - 45+
				// Assign undefined instead of using delete, see Data#remove
				elem[ dataUser.expando ] = undefined;
			}
		}
	}
} );

jQuery.fn.extend( {
	detach: function( selector ) {
		return remove( this, selector, true );
	},

	remove: function( selector ) {
		return remove( this, selector );
	},

	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each( function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				} );
		}, null, value, arguments.length );
	},

	append: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		} );
	},

	prepend: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		} );
	},

	before: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		} );
	},

	after: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		} );
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; ( elem = this[ i ] ) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		} );
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = jQuery.htmlPrefilter( value );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch ( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var ignored = [];

		// Make the changes, replacing each non-ignored context element with the new content
		return domManip( this, arguments, function( elem ) {
			var parent = this.parentNode;

			if ( jQuery.inArray( this, ignored ) < 0 ) {
				jQuery.cleanData( getAll( this ) );
				if ( parent ) {
					parent.replaceChild( elem, this );
				}
			}

		// Force callback invocation
		}, ignored );
	}
} );

jQuery.each( {
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );
			push.apply( ret, elems );
		}

		return this.pushStack( ret );
	};
} );

export { jQuery, jQuery as $ };
