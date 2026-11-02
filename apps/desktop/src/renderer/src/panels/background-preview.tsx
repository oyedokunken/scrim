import { customBackgroundOf } from '../../../shared/backgrounds-contract';
import { backgroundClass, NO_BACKGROUND, type BackgroundValue } from './background-panel';
import { useBackgroundUrl } from './use-backgrounds';

/** A mock recording on the chosen background, with the chosen padding, corners and shadow. */
export function BackgroundPreview({ value }: { value: BackgroundValue }) {
  const none = value.id === NO_BACKGROUND;
  const own = customBackgroundOf(value.id) !== null;
  const url = useBackgroundUrl(value.id);
  return (
    <div className="demo-stage">
      <div
        className={`bg-frame ${none ? 'bg-none-frame' : own ? 'bg-user' : backgroundClass(value.id)}`}
        data-padding={none ? 'none' : value.padding}
        data-corners={none ? 'square' : value.corners}
        data-shadow={!none && value.shadow ? 'on' : 'off'}
        role="img"
        aria-label={
          own
            ? 'Preview of the recording on your image'
            : `Preview of the recording on the ${value.id.replace('-', ' ')} background`
        }
      >
        {own && url !== null ? (
          <img className="bg-frame-image" src={url} alt="" draggable={false} />
        ) : null}
        <div className="bg-recording" aria-hidden="true">
          <div className="demo-bar" />
          <div className="demo-body">
            <span className="demo-line wide" />
            <span className="demo-line" />
            <span className="demo-button" />
          </div>
        </div>
      </div>
    </div>
  );
}
