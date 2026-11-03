import { t, useLanguage } from '../i18n/language';
import { Icon } from './Icon';

/**
 * The one certificate the shop hands over: the customer's verified card, the customer's live preview
 * while they compose a gift, the staff builder's preview and the registry's detail dialog all render
 * this. Each used to carry its own copy of the markup with its own inline colours.
 */
export function GiftCardCertificate({
  amountLabel,
  amount,
  code,
  codeTag,
  onCopy,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  ready,
  note
}: {
  amountLabel: string;
  amount: string;
  code: string;
  codeTag?: string;
  onCopy?: () => void;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  ready?: boolean;
  note?: string | null;
}) {
  useLanguage();
  return (
    <div className="gift-card-cert">
      <div className="gift-card-cert__head">
        <div>
          <span className="gift-card-cert__brand"><Icon name="box" width={18} height={18} />{t("NineCube Digital")}</span>
          <span className="gift-card-cert__kind">{t("E-Gift Certificate")}</span>
        </div>
        <span className="gift-card-chip" aria-hidden="true" />
      </div>

      <div className="gift-card-cert__amount">
        <span>{amountLabel}</span>
        <strong>{amount}</strong>
      </div>

      <div className="gift-card-cert__code">
        <span className="mono">{code}</span>
        {onCopy
          ? <button type="button" className="btn btn--sm btn--on-cert" onClick={onCopy}><Icon name="copy" width={13} height={13} /> {t("Copy")}</button>
          : <span className="gift-card-cert__tag">{codeTag}</span>}
      </div>

      <div className="gift-card-cert__foot">
        <div>
          <span>{leftLabel}</span>
          <strong>{leftValue}</strong>
        </div>
        <div className="gift-card-cert__right">
          <span>{rightLabel}</span>
          <strong>{ready ? <Icon name="check" width={13} height={13} /> : null}{rightValue}</strong>
        </div>
      </div>

      {note ? <p className="gift-card-cert__note">“{note}”</p> : null}
    </div>
  );
}
