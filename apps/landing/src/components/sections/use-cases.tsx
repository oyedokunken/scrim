import {
  BookOpen,
  Bug,
  GraduationCap,
  Headset,
  House,
  MonitorPlay,
  type LucideIcon,
} from 'lucide-react';
import styles from './use-cases.module.css';

interface UseCase {
  icon: LucideIcon;
  title: string;
  text: string;
}

const USE_CASES: readonly UseCase[] = [
  {
    icon: BookOpen,
    title: 'Tutorials',
    text: 'Show each step, with the clicks people need to copy.',
  },
  {
    icon: MonitorPlay,
    title: 'Product demos',
    text: 'Walk customers through a feature with your face on screen.',
  },
  {
    icon: GraduationCap,
    title: 'Teaching',
    text: 'Record lessons students can pause and follow.',
  },
  {
    icon: Bug,
    title: 'Bug reports',
    text: 'Show exactly what went wrong instead of describing it.',
  },
  {
    icon: Headset,
    title: 'Sales and support',
    text: 'Answer questions with a quick, personal video.',
  },
  {
    icon: House,
    title: 'Personal',
    text: 'Help family with their PC, or save a moment from your screen.',
  },
];

export function UseCases() {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-title"
      className={`section deferred container ${styles.useCases}`}
    >
      <header className={styles.intro}>
        <h2 id="use-cases-title" className="section-title">
          Use cases
        </h2>
        <p className="lead">
          Anywhere a screen needs explaining, a recording that points at the right thing beats a
          paragraph of instructions.
        </p>
      </header>

      <ul className={styles.list}>
        {USE_CASES.map(({ icon: Icon, title, text }) => (
          <li key={title} className={styles.item}>
            <Icon aria-hidden="true" size={32} strokeWidth={1.75} />
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.text}>{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
