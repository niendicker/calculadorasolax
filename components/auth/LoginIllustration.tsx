import Image from 'next/image';

/** SolaX brand mark for the empty column beside the login form, gently
 *  floating (same login-float keyframe/reduced-motion guard as the rest of
 *  this page — see globals.css) instead of sitting static. */
export function LoginIllustration() {
  return (
    <div aria-hidden="true" className="login-illustration flex w-[42%] max-w-[22rem] items-center justify-center translate-x-[132px] -translate-y-[168px] xl:w-[52%] xl:max-w-[30rem] 2xl:w-[62%] 2xl:max-w-[38rem]">
      <Image
        src="/images/login/cloud-c1b62cbb.png"
        alt=""
        width={520}
        height={460}
        priority
        className="h-auto w-full animate-[login-float_5s_ease-in-out_infinite] drop-shadow-2xl"
      />
    </div>
  );
}
