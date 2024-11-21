import React from 'react';

interface ProgressOverlayProps {
  stage: string;
  message: string;
  current: number;
  total: number;
  details?: {
    processedNodes: number;
    processedEdges: number;
    discoveredCommunities: number;
  };
}

const ProgressOverlay: React.FC<ProgressOverlayProps> = ({ 
  stage, 
  message, 
  current, 
  total,
  details 
}) => {
  const progress = (current / total) * 100;

  return (
    <div className="w-full h-[600px] bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {stage.charAt(0).toUpperCase() + stage.slice(1)}
        </h3>
        <p className="text-gray-600 mb-4">{message}</p>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
          <div 
            className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Progress Details */}
        {details && (
          <div className="text-sm text-gray-500 space-y-1">
            <p>Processed Nodes: {details.processedNodes}</p>
            <p>Processed Edges: {details.processedEdges}</p>
            <p>Discovered Communities: {details.discoveredCommunities}</p>
          </div>
        )}

        {/* Progress Percentage */}
        <p className="text-sm text-gray-500 mt-2">
          {Math.round(progress)}% Complete
        </p>
      </div>
    </div>
  );
};

export default ProgressOverlay;
