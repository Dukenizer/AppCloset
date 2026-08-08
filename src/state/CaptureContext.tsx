import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

interface CaptureContextValue {
  capturedUri: string | null;
  setCapturedUri: (uri: string | null) => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const value = useMemo(() => ({ capturedUri, setCapturedUri }), [capturedUri]);
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error('useCapture must be used inside CaptureProvider.');
  return value;
}
