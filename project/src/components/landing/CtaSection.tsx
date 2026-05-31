type CtaSectionProps = {
    onStart?: () => void;
  };
  
  export default function CtaSection({ onStart }: CtaSectionProps) {
    return (
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-12 text-center relative overflow-hidden shadow-2xl shadow-blue-500/20">
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              جاهز للانضمام إلى شبكة مِحور؟
            </h2>
            <p className="text-blue-100 text-lg mb-10 max-w-xl mx-auto">
              كن من أوائل المحلات التي تنضم إلى شبكة مِحور واستفد من عرض الإطلاق المجاني لمدة 3 أشهر.
            </p>
            <button 
              onClick={() => onStart?.()}
              className="bg-white text-blue-600 px-10 py-5 rounded-2xl font-black text-xl hover:bg-blue-50 transition-all shadow-xl"
            >
              ابدأ مجاناً
            </button>
          </div>
          
          {/* Background Decorative Elements */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-900/20 rounded-full blur-3xl"></div>
        </div>
      </section>
    );
  }