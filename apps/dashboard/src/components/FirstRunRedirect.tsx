import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';

import { Fleet } from '../pages/Fleet.js';

export function FirstRunRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch('/v1/setup/status', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { needsOnboarding: boolean }) => {
        const skipped = localStorage.getItem('paws_setup_skipped') === 'true';
        if (data.needsOnboarding && !skipped && location.pathname === '/') {
          navigate('/setup', { replace: true });
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [navigate, location.pathname]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return <Fleet />;
}
