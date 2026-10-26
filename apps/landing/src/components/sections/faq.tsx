import { Plus } from 'lucide-react';
import { FAQ, type FaqItem } from '@/lib/faq';
import styles from './faq.module.css';

/** Splits the list in two, so each column reads top to bottom in order. */
function inColumns(items: readonly FaqItem[]): [FaqItem[], FaqItem[]] {
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}

export function Faq() {
  const columns = inColumns(FAQ);
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className={`section deferred container ${styles.faq}`}
    >
      <header className={styles.intro}>
        <h2 id="faq-title" className="section-title">
          You probably have questions.
        </h2>
        <p className="lead">So we answered them below. When you use Scrim, you are in control.</p>
      </header>

      <div className={styles.columns}>
        {columns.map((items, index) => (
          <div key={index} className={styles.column}>
            {items.map((item) => (
              <details key={item.question} className={styles.item}>
                <summary>
                  <span>{item.question}</span>
                  <Plus aria-hidden="true" size={22} strokeWidth={2.25} />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
