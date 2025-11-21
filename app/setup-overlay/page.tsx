'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseEmbedded } from '@/lib/supabaseEmbedded';
import { Card, Page, Text, Button, Banner, Checkbox, TextField, Spinner, Select } from '@shopify/polaris';

type UserAccount = {
  id: string;
  account_id: string;
  name?: string | null;
  status?: string | null;
};

type Instance = {
  id: string;
  name: string;
  created_at: string | null;
  account_id: string | null;
};

// Helper functions for color conversion
const rgbaToHex = (rgba: string): string => {
  if (rgba?.startsWith('#')) return rgba;
  const match = rgba?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#000000';
  const r = parseInt(match[1] || '0');
  const g = parseInt(match[2] || '0');
  const b = parseInt(match[3] || '0');
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
};

const hexToRgba = (hex: string, originalRgba?: string): string => {
  if (!hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  if (originalRgba?.includes('rgba')) {
    const alphaMatch = originalRgba.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
    const alpha = alphaMatch ? alphaMatch[1] : '0.6';
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
};

// Helper function to get position styles for preview
const getPositionStyles = (position: string): React.CSSProperties => {
  const styles: Record<string, React.CSSProperties> = {
    'top-left': { top: 8, left: 8 },
    'top-right': { top: 8, right: 8 },
    'top-center': { top: 8, left: '50%', transform: 'translateX(-50%)' },
    'bottom-left': { bottom: 8, left: 8 },
    'bottom-right': { bottom: 8, right: 8 },
    'bottom-center': { bottom: 8, left: '50%', transform: 'translateX(-50%)' },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  };
  return styles[position] || styles['bottom-right'];
};

type Step = 1 | 2 | 3 | 4;

export default function SetupOverlayPage() {
  const authedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), []);
  const [step, setStep] = useState<Step>(1);
  const [shop, setShop] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState<boolean>(false);
  const [sessionChecked, setSessionChecked] = useState<boolean>(false);
  
  // Step 1: Account selection
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  
  // Step 2: Instance selection
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [instancesLoading, setInstancesLoading] = useState(false);
  
  // Step 3: Overlay design
  const [overlayText, setOverlayText] = useState<string>('SeeItFirst');
  const [overlayBg, setOverlayBg] = useState<string>('rgba(0,0,0,0.6)');
  const [overlayColor, setOverlayColor] = useState<string>('#fff');
  const [overlayPosition, setOverlayPosition] = useState<string>('bottom-right');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qsShop = sp.get('shop');
    const qsHost = sp.get('host');
    if (qsShop) setShop(qsShop);
    else {
      try {
        const ls = localStorage.getItem('sif_last_shop');
        if (ls) setShop(ls);
      } catch {}
    }
    if (qsHost) setHost(qsHost);
    else {
      try {
        const lh = localStorage.getItem('sif_last_host');
        if (lh) setHost(lh);
      } catch {}
    }
  }, []);

  // Check session first - wait a bit for session to be available
  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = getSupabaseEmbedded();
        // Wait a moment for session to be available (embedded app context)
        await new Promise(resolve => setTimeout(resolve, 200));
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const hasSession = !!sessionData?.session;
        setNeedsLogin(!hasSession);
        setSessionChecked(true);
        setLoading(false);
      } catch (e: any) {
        // On error, try one more time after a delay
        setTimeout(async () => {
          try {
            const supabase = getSupabaseEmbedded();
            const { data: sessionData } = await supabase.auth.getSession();
            const hasSession = !!sessionData?.session;
            setNeedsLogin(!hasSession);
            setSessionChecked(true);
            setLoading(false);
          } catch {
            setNeedsLogin(true);
            setSessionChecked(true);
            setLoading(false);
          }
        }, 500);
      }
    };
    checkSession();
  }, []);

  // Allow re-login from this page
  useEffect(() => {
    const supabase = getSupabaseEmbedded();
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event as any).data?.type === 'SIF_SUPABASE_SESSION') {
        const { access_token, refresh_token } = (event as any).data;
        await supabase.auth.setSession({ access_token, refresh_token });
        setNeedsLogin(false);
        location.reload();
      }
    };
    window.addEventListener('message', handler);
    let unsub = () => {};
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('sif-auth');
      const onBc = async (event: MessageEvent) => {
        if ((event as any).data?.type === 'SIF_SUPABASE_SESSION') {
          const { access_token, refresh_token } = (event as any).data;
          await supabase.auth.setSession({ access_token, refresh_token });
          setNeedsLogin(false);
          location.reload();
        }
      };
      bc.addEventListener('message', onBc);
      unsub = () => bc.removeEventListener('message', onBc);
    }
    return () => {
      window.removeEventListener('message', handler);
      unsub();
    };
  }, []);

  // Load accounts for step 1
  useEffect(() => {
    const loadAccounts = async () => {
      // Don't load if we're still checking session, need login, or don't have shop
      if (!sessionChecked || needsLogin || !shop) {
        if (!shop && sessionChecked) setAccountsLoading(false);
        return;
      }
      
      setAccountsLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseEmbedded();
        // Double-check session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) {
          setNeedsLogin(true);
          setAccountsLoading(false);
          return;
        }
        const { data, error: fetchError } = await supabase
          .from('user_accounts' as any)
          .select('*')
          .eq('user_id', sessionData.session.user.id)
          .order('created_at', { ascending: false } as any);
        if (fetchError) throw fetchError;
        setAccounts(((data as unknown) as UserAccount[]) || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load accounts');
      } finally {
        setAccountsLoading(false);
      }
    };
    loadAccounts();
  }, [shop, sessionChecked, needsLogin]);

  // Load instances when account is selected (step 2)
  useEffect(() => {
    const loadInstances = async () => {
      if (step !== 2 || !selectedAccountId) return;
      setInstancesLoading(true);
      try {
        const res = await authedFetch(`/api/instances?account_id=${encodeURIComponent(selectedAccountId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load instances');
        setInstances(((json?.instances as unknown) as Instance[]) || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load instances');
      } finally {
        setInstancesLoading(false);
      }
    };
    loadInstances();
  }, [step, selectedAccountId, authedFetch]);

  const handleNext = () => {
    if (step === 1 && selectedAccountId) {
      setStep(2);
    } else if (step === 2 && selectedInstanceId) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const handleComplete = async () => {
    if (!shop || !selectedAccountId || !selectedInstanceId) return;
    
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 1. Connect account to shop if not already connected
      try {
        await authedFetch('/api/accounts/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: selectedAccountId, shop }),
        });
      } catch (e: any) {
        // May already be connected, continue
      }

      // 2. Set selected instance
      await authedFetch('/api/accounts/ui-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          account_id: selectedAccountId,
          selected_instance_id: selectedInstanceId,
        }),
      });

      // 3. Enable overlay and set config
      await authedFetch('/api/shopify/theme-inject/product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          instance_id: selectedInstanceId,
          enable_overlay: true,
          overlay_text: overlayText,
          overlay_bg: overlayBg,
          overlay_color: overlayColor,
          overlay_position: overlayPosition,
        }),
      });

      // 4. Save UI state with overlay config
      await authedFetch('/api/accounts/ui-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          account_id: selectedAccountId,
          selected_instance_id: selectedInstanceId,
          enable_overlay: true,
          overlay_config: {
            text: overlayText,
            bg: overlayBg,
            color: overlayColor,
            position: overlayPosition,
          },
        }),
      });

      setSaveSuccess(true);
      setStep(4);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to complete setup');
    } finally {
      setSaving(false);
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return 'Choose an account';
      case 2: return 'Choose an instance';
      case 3: return 'Design product overlay';
      case 4: return 'Setup complete!';
      default: return 'Setup';
    }
  };

  const openLogin = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const host = sp.get('host');
      const shop = sp.get('shop');
      const url = `/auth?embedded=1&force=1${shop ? `&shop=${encodeURIComponent(shop)}` : ''}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
      window.open(url, 'sif-auth', 'width=520,height=640');
    } catch {}
  };

  const onBack = () => {
    const qp = new URLSearchParams();
    if (shop) qp.set('shop', shop);
    if (host) qp.set('host', host);
    location.assign(`/?${qp.toString()}`);
  };

  return (
    <Page 
      title="Set up Product Overlay Buttons"
      backAction={{ content: 'Back', onAction: onBack }}
    >
      <Card>
        <div style={{ padding: 24, display: 'grid', gap: 24 }}>
          {/* Progress indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: step >= s ? '#008060' : '#e5e5e5',
                    color: step >= s ? '#fff' : '#666',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: 14,
                  }}
                >
                  {s}
                </div>
                {s < 4 && (
                  <div
                    style={{
                      width: 40,
                      height: 2,
                      background: step > s ? '#008060' : '#e5e5e5',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <div>
            <Text as="h2" variant="headingLg">{getStepTitle()}</Text>
          </div>

          {loading || !sessionChecked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24 }}>
              <Spinner size="small" />
              <Text as="span" variant="bodySm" tone="subdued">Loading...</Text>
            </div>
          ) : needsLogin ? (
            <div style={{ display: 'grid', gap: 16, padding: 24, textAlign: 'center' }}>
              <Text as="p" variant="bodyMd" tone="subdued">
                Please sign in to continue setting up your overlay buttons.
              </Text>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button onClick={openLogin} variant="primary">
                  Sign in
                </Button>
              </div>
            </div>
          ) : (
            <>
              {error && <Banner tone="critical">{error}</Banner>}
              {saveError && <Banner tone="critical">{saveError}</Banner>}

          {/* Step 1: Choose Account */}
          {step === 1 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <Text as="p" variant="bodyMd" tone="subdued">
                Select the account you want to use for your product overlay buttons.
              </Text>
              {accountsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Spinner size="small" />
                  <Text as="span" variant="bodySm">Loading accounts...</Text>
                </div>
              ) : accounts.length === 0 ? (
                <Text as="p" tone="subdued">No accounts found. Please create an account first.</Text>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.account_id)}
                      style={{
                        padding: 16,
                        border: selectedAccountId === acc.account_id ? '2px solid #008060' : '1px solid #e5e5e5',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: selectedAccountId === acc.account_id ? '#f0f9f7' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                          type="radio"
                          checked={selectedAccountId === acc.account_id}
                          onChange={() => setSelectedAccountId(acc.account_id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <Text as="p" variant="bodyMd" fontWeight="medium">
                            {acc.name || acc.id}
                          </Text>
                          {acc.status && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {acc.status}
                            </Text>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={handleNext} disabled={!selectedAccountId} variant="primary">
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Choose Instance */}
          {step === 2 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <Text as="p" variant="bodyMd" tone="subdued">
                Select the instance you want to use for your product overlay buttons.
              </Text>
              {instancesLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Spinner size="small" />
                  <Text as="span" variant="bodySm">Loading instances...</Text>
                </div>
              ) : instances.length === 0 ? (
                <Text as="p" tone="subdued">No instances found for this account.</Text>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {instances.map((inst) => (
                    <div
                      key={inst.id}
                      onClick={() => setSelectedInstanceId(inst.id)}
                      style={{
                        padding: 16,
                        border: selectedInstanceId === inst.id ? '2px solid #008060' : '1px solid #e5e5e5',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: selectedInstanceId === inst.id ? '#f0f9f7' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                          type="radio"
                          checked={selectedInstanceId === inst.id}
                          onChange={() => setSelectedInstanceId(inst.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <Text as="p" variant="bodyMd" fontWeight="medium">
                            {inst.name || inst.id}
                          </Text>
                          {inst.created_at && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Created {new Date(inst.created_at).toLocaleDateString()}
                            </Text>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Button onClick={handleBack}>Back</Button>
                <Button onClick={handleNext} disabled={!selectedInstanceId} variant="primary">
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Design Overlay */}
          {step === 3 && (
            <div style={{ display: 'grid', gap: 24 }}>
              <Text as="p" variant="bodyMd" tone="subdued">
                Customize the appearance of your product overlay button. Changes are previewed in real-time.
              </Text>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24 }}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <TextField 
                    label="Overlay text" 
                    value={overlayText} 
                    onChange={(v) => setOverlayText(v)} 
                    autoComplete="off" 
                    helpText="The text displayed on the overlay button"
                  />
                  
                  <div style={{ display: 'grid', gap: 4 }}>
                    <Text as="p" variant="bodyMd" fontWeight="medium">Overlay background</Text>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: 6, 
                        border: '1px solid #e5e5e5',
                        background: overlayBg || 'rgba(0,0,0,0.6)',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}>
                        <input
                          type="color"
                          value={rgbaToHex(overlayBg || 'rgba(0,0,0,0.6)')}
                          onChange={(e) => {
                            const hex = e.target.value;
                            setOverlayBg(hexToRgba(hex, overlayBg));
                          }}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            opacity: 0, 
                            cursor: 'pointer',
                            border: 'none',
                            padding: 0,
                            margin: 0
                          }}
                        />
                      </div>
                      <TextField 
                        label=""
                        value={overlayBg} 
                        onChange={(v) => setOverlayBg(v)} 
                        autoComplete="off"
                        placeholder="rgba(0,0,0,0.6) or #000000"
                        helpText="Background color (supports rgba for transparency)"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <Text as="p" variant="bodyMd" fontWeight="medium">Overlay text color</Text>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: 6, 
                        border: '1px solid #e5e5e5',
                        background: overlayColor || '#ffffff',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}>
                        <input
                          type="color"
                          value={rgbaToHex(overlayColor || '#ffffff')}
                          onChange={(e) => setOverlayColor(e.target.value)}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            opacity: 0, 
                            cursor: 'pointer',
                            border: 'none',
                            padding: 0,
                            margin: 0
                          }}
                        />
                      </div>
                      <TextField 
                        label=""
                        value={overlayColor} 
                        onChange={(v) => setOverlayColor(v)} 
                        autoComplete="off"
                        placeholder="#ffffff"
                        helpText="Text color"
                      />
                    </div>
                  </div>

                  <Select
                    label="Button position"
                    options={[
                      { label: 'Top left', value: 'top-left' },
                      { label: 'Top right', value: 'top-right' },
                      { label: 'Top center', value: 'top-center' },
                      { label: 'Bottom left', value: 'bottom-left' },
                      { label: 'Bottom right', value: 'bottom-right' },
                      { label: 'Bottom center', value: 'bottom-center' },
                      { label: 'Center', value: 'center' },
                    ]}
                    value={overlayPosition}
                    onChange={(v) => setOverlayPosition(v)}
                  />
                </div>
                
                {/* Live preview */}
                <div style={{ position: 'relative', width: 320, height: 200, background: '#f4f4f5', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                  <div
                    style={{
                      position: 'absolute',
                      ...getPositionStyles(overlayPosition),
                      background: overlayBg,
                      color: overlayColor,
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    {overlayText || 'SeeItFirst'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Button onClick={handleBack}>Back</Button>
                <Button onClick={handleComplete} loading={saving} variant="primary">
                  Complete Setup
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div style={{ display: 'grid', gap: 16, textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
              <Banner tone="success">
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  Product overlay buttons have been successfully set up!
                </Text>
              </Banner>
              <Text as="p" variant="bodyMd" tone="subdued">
                Your overlay buttons are now active on your product pages. You can manage and customize them anytime from the instances page.
              </Text>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <Button onClick={onBack} variant="primary">
                  Return to Home
                </Button>
                <Button
                  onClick={() => {
                    const qp = new URLSearchParams();
                    if (shop) qp.set('shop', shop);
                    if (host) qp.set('host', host);
                    if (selectedAccountId) qp.set('account_id', selectedAccountId);
                    location.assign(`/instances?${qp.toString()}`);
                  }}
                >
                  Manage Instances
                </Button>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}

