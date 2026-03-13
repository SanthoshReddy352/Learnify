import React from 'react';

const ThreeDLoadingBar = () => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 space-y-8 min-h-[300px]">
      <div className="relative w-64 h-8 perspective-1000">
        <div className="absolute inset-0 bg-primary/20 rounded-full transform rotate-x-45 border border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-transparent via-primary to-transparent w-[200%] animate-shimmer" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
             {/* 3D Cube Spinner */}
             <div className="relative w-16 h-16 animate-spin-slow preserve-3d">
                <div className="absolute inset-0 bg-primary/40 translate-z-8 border border-primary/50 backdrop-blur-md rounded-lg" />
                <div className="absolute inset-0 bg-primary/40 -translate-z-8 border border-primary/50 backdrop-blur-md rounded-lg" />
                <div className="absolute inset-0 bg-primary/40 rotate-y-90 translate-z-8 border border-primary/50 backdrop-blur-md rounded-lg" />
                <div className="absolute inset-0 bg-primary/40 rotate-y-90 -translate-z-8 border border-primary/50 backdrop-blur-md rounded-lg" />
                <div className="absolute inset-0 bg-primary/40 rotate-x-90 translate-z-8 border border-primary/50 backdrop-blur-md rounded-lg" />
                <div className="absolute inset-0 bg-primary/40 rotate-x-90 -translate-z-8 border border-primary/50 backdrop-blur-md rounded-lg" />
             </div>
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400 animate-pulse">
          Designing Curriculum...
        </h3>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Our AI is constructing your personalized knowledge graph and dependency map.
        </p>
      </div>

      <style jsx>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .translate-z-8 {
          transform: translateZ(32px);
        }
        .-translate-z-8 {
          transform: translateZ(-32px);
        }
        .rotate-y-90 {
            transform: rotateY(90deg);
        }
        .rotate-x-90 {
            transform: rotateX(90deg);
        }
        @keyframes spin-slow {
            0% { transform: rotateX(0deg) rotateY(0deg); }
            100% { transform: rotateX(360deg) rotateY(360deg); }
        }
        .animate-spin-slow {
            animation: spin-slow 8s linear infinite;
        }
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(50%); }
        }
        .animate-shimmer {
            animation: shimmer 1.5s infinite linear;
        }
      `}</style>
    </div>
  );
};

export default ThreeDLoadingBar;
