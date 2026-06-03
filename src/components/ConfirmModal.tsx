'use client'
import { AlertTriangle, X } from 'lucide-react'
import Portal from './Portal'
import clsx from 'clsx'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning'
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <Portal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" 
          onClick={onClose} 
        />
        
        {/* Modal */}
        <div className="relative bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl shadow-slate-900/20 overflow-hidden animate-scale-in">
          <div className="p-8 text-center space-y-6">
            <div className={clsx(
              "w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-2",
              variant === 'danger' ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
            )}>
              <AlertTriangle size={40} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">{title}</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">{message}</p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <button
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
                className={clsx(
                  "w-full py-4 rounded-2xl text-sm font-black transition-all shadow-lg",
                  variant === 'danger' 
                    ? "bg-red-600 text-white hover:bg-red-700 shadow-red-900/20" 
                    : "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-900/20"
                )}
              >
                {confirmText}
              </button>
              <button
                onClick={onClose}
                className="w-full py-4 rounded-2xl text-sm font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
              >
                {cancelText}
              </button>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </Portal>
  )
}
