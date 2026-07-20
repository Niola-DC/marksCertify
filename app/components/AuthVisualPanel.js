// Brand visual for the auth split-screen — reuses the certificate's
// gold-on-black ornament language instead of stock photography.

export default function AuthVisualPanel({ heading, subheading }) {
  return (
    <div className="hidden lg:flex relative flex-1 bg-[#0D0D0D] items-center justify-center overflow-hidden p-12">
      <div className="absolute inset-6 border border-[#B8962E]/40" />
      <div className="absolute inset-8 border border-[#B8962E]/15" />

      <div className="absolute top-6 left-6 h-10 w-10 border-t-2 border-l-2 border-[#B8962E]" />
      <div className="absolute top-6 right-6 h-10 w-10 border-t-2 border-r-2 border-[#B8962E]" />
      <div className="absolute bottom-6 left-6 h-10 w-10 border-b-2 border-l-2 border-[#B8962E]" />
      <div className="absolute bottom-6 right-6 h-10 w-10 border-b-2 border-r-2 border-[#B8962E]" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
        <div className="h-16 w-16 rounded-2xl bg-[#B8962E]/10 border border-[#B8962E]/40 flex items-center justify-center mb-6">
          <span className="text-[#B8962E] text-2xl font-bold">M</span>
        </div>
        <p className="text-[11px] tracking-[4px] uppercase text-[#B8962E] font-semibold mb-3">MarksCertify</p>
        <h2 className="text-2xl font-semibold text-white mb-3">{heading}</h2>
        <p className="text-sm text-white/40 leading-relaxed">{subheading}</p>
      </div>
    </div>
  )
}
