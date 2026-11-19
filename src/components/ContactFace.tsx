
const HEAD =
  'M34.6953 0C53.8571 0 69.3916 15.5855 69.3916 34.8105C69.3914 54.0354 53.857 69.6201 34.6953 69.6201C15.5338 69.6199 0.000238371 54.0353 0 34.8105C0 15.5856 15.5337 0.000210079 34.6953 0Z';
const MOUTH =
  'M34.9707 58.3516C29.4484 58.3516 24.9712 59.471 24.9707 60.8516C24.9715 62.2321 29.4486 63.3515 34.9707 63.3516C40.4931 63.3516 44.97 62.2321 44.9707 60.8516C44.9702 59.471 40.4932 58.3516 34.9707 58.3516Z';
const EYE_L =
  'M18.4707 18.3516C12.672 18.3521 7.97078 26.187 7.9707 35.8516C7.97082 45.5161 12.672 53.351 18.4707 53.3516C24.2696 53.3516 28.9706 45.5164 28.9707 35.8516C28.9706 26.1867 24.2696 18.3516 18.4707 18.3516Z';
const EYE_R =
  'M50.4707 18.3516C44.672 18.3521 39.9708 26.187 39.9707 35.8516C39.9708 45.5161 44.672 53.351 50.4707 53.3516C56.2696 53.3516 60.9706 45.5164 60.9707 35.8516C60.9706 26.1867 56.2696 18.3516 50.4707 18.3516Z';

export default function ContactFace({ filterId = 'contact-face-clip' }: { filterId?: string }) {
  return (
    <svg
      className="arrow-face-blob is-face-settled"
      viewBox="0 0 70 70"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      data-mark-face=""
      overflow="visible"
      preserveAspectRatio="none"
    >
      <defs>
        <clipPath id={filterId}>
          <path d={HEAD} />
        </clipPath>
      </defs>
      <g data-face-glance-layer="">
        <path d={HEAD} fill="currentColor" />
        <path data-face-mouth="" d={MOUTH} />
        <g clipPath={`url(#${filterId})`}>
          <g data-face-features="">
            <path d={EYE_L} />
            <path d={EYE_R} />
          </g>
        </g>
      </g>
    </svg>
  );
}
