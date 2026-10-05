import { Sparkles } from 'lucide-react'

export function DemoReply({ text }: { text: string }) {
  return (
    <article className="demo-reply" aria-label="Local demo simulation response">
      <div className="demo-reply__label">
        <Sparkles size={13} aria-hidden="true" />
        <span>Demo simulation</span>
      </div>
      <p>{text}</p>
    </article>
  )
}
