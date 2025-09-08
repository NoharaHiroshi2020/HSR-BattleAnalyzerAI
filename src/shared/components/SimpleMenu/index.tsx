import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Brain, Settings, Sparkles } from 'lucide-react';

export const SimpleMenu: React.FC = () => {
  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
             <motion.div 
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.6 }}
         className="card bg-base-100 shadow-2xl w-96 mb-8"
       >
        <div className="card-body text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mb-4"
          >
            <Sparkles className="w-16 h-16 mx-auto text-primary" />
          </motion.div>
          
          <h1 className="card-title text-3xl font-bold text-primary justify-center mb-6">
            崩壊スターレイル戦闘分析
          </h1>
          
          <div className="space-y-4">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary btn-lg w-full gap-2"
            >
              <Upload className="w-5 h-5" />
              ファイルをアップロード
            </motion.button>
            
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-secondary btn-lg w-full gap-2"
            >
              <Brain className="w-5 h-5" />
              AI分析開始
            </motion.button>
            
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-accent btn-lg w-full gap-2"
            >
              <Settings className="w-5 h-5" />
              設定
            </motion.button>
          </div>
                 </div>
       </motion.div>
       
                        {/* 結果表示エリア */}
         <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, delay: 0.3 }}
           className="card bg-base-100 shadow-xl w-[600px]"
         >
         <div className="card-body text-center">
           <h2 className="card-title text-2xl font-bold text-secondary justify-center mb-4">
             分析結果
           </h2>
           <div className="bg-base-200 rounded-lg p-6 min-h-32">
             <p className="text-base-content/60">
               戦闘ログをアップロードして分析を開始してください
             </p>
           </div>
         </div>
               </motion.div>
      </div>
    </div>
  );
};
