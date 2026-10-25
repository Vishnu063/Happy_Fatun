import { guides, guideURL } from "../../shared/content";
export default function Guides({ path }: { path: string }) {
  const selected = guides.find((g) => guideURL(g) === path);
  return (
    <section className="container prose">
      <p className="eyebrow">FURNITURE BUYING GUIDES</p>
      {selected ? (
        <>
          <h1>{selected.title}</h1>
          <p>{selected.description}</p>
          {selected.sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </section>
          ))}
          <a href="/guides">All buying guides</a>
        </>
      ) : (
        <>
          <h1>Make an informed furniture request.</h1>
          <p>
            A little preparation helps you compare designs and quotations. These
            guides explain what to measure and what to ask; the manufacturer
            must review your final specification.
          </p>
          {guides.map((g) => (
            <article key={g.slug}>
              <h2>
                <a href={guideURL(g)}>{g.title}</a>
              </h2>
              <p>{g.description}</p>
            </article>
          ))}
        </>
      )}
      <p>
        <a href="/">Browse furniture concepts</a> ·{" "}
        <a href="/contact">Discuss your request</a>
      </p>
    </section>
  );
}
