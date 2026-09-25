import React, { useRef, useState, useEffect } from 'react';

export function DropdownMenu({ trigger, children, placement = 'bottom-end' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {typeof trigger === 'function'
        ? trigger({ open, setOpen })
        : React.cloneElement(trigger, { onClick: () => setOpen(!open), 'aria-expanded': open })}
      {open ? (
        <div
          className="dropdown-menu"
          style={{
            position: 'absolute',
            top: '100%',
            zIndex: 100,
            backgroundColor: 'var(--panel)',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            padding: 4,
            boxShadow: 'var(--shadow-md)',
            minWidth: 160,
            ...(placement === 'bottom-end' && { right: 0 }),
          }}
        >
          {/* A function child receives a way to close the menu — needed when an item inside
              navigates, since the menu would otherwise survive the route change. Existing
              call sites pass elements and are unaffected. */}
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      ) : null}
    </div>
  );
}