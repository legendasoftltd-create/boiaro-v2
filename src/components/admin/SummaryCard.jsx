import React from 'react';

const SummaryCard = ({ 
  icon: Icon, 
  title, 
  value, 
  color = "", 
  className = "" 
}) => {
  return (
    <div className={`w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans ${className}`}>
      {/* Upper Section: Icon and Label */}
      <div className="flex items-center gap-3 mb-4">
        <div style={{ color: color }}>
          {Icon ? <Icon size={24} strokeWidth={2.5} />: <span className='text-2xl font-bold'>৳</span>}
        </div>
        <span 
          className="font-bold tracking-wider text-sm" 
          style={{ color: color }}
        >
          {title}
        </span>
      </div>

      {/* Lower Section: Number */}
      <div 
        className="text-2xl font-black" 
        style={{ color: color }}
      >
        {value}
      </div>
    </div>
  );
};

export default SummaryCard;