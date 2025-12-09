'use client';

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';

export function DownloadBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // CRITICAL: This banner MUST NOT appear in the Android application.
    // The user has strictly requested that this never shows up in the native app.
    // We use multiple checks to ensure safety.
    const platform = Capacitor.getPlatform();
    const isNative = Capacitor.isNativePlatform();
    
    if (platform === 'android' || platform === 'ios' || isNative) {
      console.log('DownloadBanner: Native platform detected, suppressing banner.');
      return;
    }
    
    // Only show if NOT native and we haven't dismissed it this session
    // You could also use localStorage to persist dismissal across sessions if desired
    const isDismissed = sessionStorage.getItem('download-banner-dismissed');
    
    if (!isDismissed) {
      // Small delay for entrance animation
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('download-banner-dismissed', 'true');
  };

  const handleDownload = () => {
    // Create a link element safely
    const link = document.createElement('a');
    link.href = '/Learnify.apk';
    link.download = 'Learnify.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isMounted) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md md:left-auto md:right-4 md:w-full"
        >
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm">Get the Android App</span>
                <span className="text-xs text-muted-foreground">Better experience, offline mode</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
                <Button 
                    size="sm" 
                    className="h-8 gap-1.5 rounded-full px-4 text-xs font-medium"
                    onClick={handleDownload}
                >
                    Download
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-muted"
                    onClick={handleDismiss}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Dismiss</span>
                </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
