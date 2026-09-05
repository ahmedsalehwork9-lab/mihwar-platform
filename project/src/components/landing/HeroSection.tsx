import { ChevronLeft, Play } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';

type ActivityType = 'spare-parts' | 'grocery' | 'cafe' | 'restaurant' | 'retail' | 'general';

type HeroSectionProps = {
  onStart?: () => void;
  onLogin?: () => void;
  activity?: ActivityType;
};

const CONTENT: Record<ActivityType, { title1: string; title2: string; description: string }> = {
  'spare-parts': { title1: 'شبكة تجارة', title2: 'قطع الغيار الذكية', description: 'منصة ذكية لإدارة المنتجات والمخزون والطلبات بين محلات قطع الغيار من مكان واحد.' },
  'grocery': { title1: 'منصة تجارة', title2: 'التموينات الذكية', description: 'منصة ذكية لإدارة المنتجات والمخزون والطلبات بين فروع ومحلات التموينات من مكان واحد.' },
  'cafe': { title1: 'منصة إدارة', title2: 'المقاهي والفروع الذكية', description: 'منصة ذكية لإدارة المنتجات والمخزون والطلبات والمبيعات للمقاهي والفروع من مكان واحد.' },
  'restaurant': { title1: 'منصة إدارة', title2: 'المطاعم والفروع الذكية', description: 'منصة ذكية لإدارة المنتجات والمخزون والطلبات والمبيعات للمطاعم والفروع من مكان واحد.' },
  'retail': { title1: 'منصة تجارة', title2: 'التجزئة الذكية', description: 'منصة متكاملة لإدارة المنتجات والمخزون والطلبات والفروع من مكان واحد.' },
  'general': { title1: 'منصة محور', title2: 'للتجارة وإدارة الأعمال', description: 'منصة ذكية لإدارة المنتجات والمخزون والطلبات والفروع والعمليات التجارية من مكان واحد.' },
};

export default function HeroSection({ onStart, activity = 'general' }: HeroSectionProps) {
  const { t } = useLang();
  const current = CONTENT[activity];

  return (
    <section className='relative pt-32 pb-20 px-4'>
      <div className='max-w-7xl mx-auto text-center'>
        <div className='inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-8'>
          <span className='relative flex h-2 w-2'>
            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75'></span>
            <span className='relative inline-flex rounded-full h-2 w-2 bg-blue-500'></span>
          </span>
          <span className='text-blue-400 text-xs font-bold uppercase tracking-wider'>
            {t('New MIHWAR System 2.0', 'نظام محور الجديد 2.0')}
          </span>
        </div>

        <h1 className='text-5xl md:text-7xl font-black text-white mb-6 leading-tight'>
          {current.title1} <br />
          <span className='text-transparent bg-clip-text bg-gradient-to-l from-blue-400 to-indigo-500'>
            {current.title2}
          </span>
        </h1>

        <p className='text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed'>
          {current.description}
        </p>

        <div className='flex flex-col sm:flex-row items-center justify-center gap-4'>
          <button onClick={() => onStart?.()} className='w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-slate-950 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-100 transition-all group'>
            {t('Start Your Free Trial', 'ابدأ تجربتك المجانية')}
            <ChevronLeft size={20} className='group-hover:-translate-x-1 transition-transform' />
          </button>

          <button className='w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 text-white border border-slate-800 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all'>
            <Play size={18} fill='currentColor' />
            {t('Watch the Demo', 'شاهد العرض التجريبي')}
          </button>
        </div>
      </div>
    </section>
  );
}
