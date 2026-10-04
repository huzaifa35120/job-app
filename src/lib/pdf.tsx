import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CoverLetter, TailoredResume } from "./ai";
import type { Profile } from "./profile";

const s = StyleSheet.create({
  page: { paddingVertical: 32, paddingHorizontal: 40, fontSize: 9.5, fontFamily: "Helvetica", lineHeight: 1.35, color: "#111" },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  headline: { fontSize: 10.5, marginTop: 3, color: "#333", lineHeight: 1.3 },
  contact: { fontSize: 8.5, marginTop: 4, color: "#444" },
  section: { marginTop: 10 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.75,
    borderBottomColor: "#999",
    paddingBottom: 2,
    marginBottom: 4,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  item: { marginBottom: 5 },
  bullet: { flexDirection: "row", marginLeft: 6 },
  bulletDot: { width: 8 },
  bulletText: { flex: 1 },
  letterPage: { paddingVertical: 56, paddingHorizontal: 64, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5, color: "#111" },
  para: { marginBottom: 10 },
});

function contactParts(p: Profile): string[] {
  const { email, phone, location, linkedin, github, website } = p.personal;
  return [location, phone, email, linkedin, github, website].filter(Boolean);
}

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.filter(Boolean).map((b, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

function Header({ profile, headline }: { profile: Profile; headline: string }) {
  return (
    <View>
      <Text style={s.name}>{profile.personal.fullName || "Your Name"}</Text>
      {headline ? <Text style={s.headline}>{headline}</Text> : null}
      <Text style={s.contact}>
        {contactParts(profile).map((c, i) => (
          <Text key={i}>
            {i > 0 ? "\u00a0\u00a0·\u00a0\u00a0" : ""}
            {/^https?:\/\//.test(c) ? <Link src={c}>{c.replace(/^https?:\/\/(www\.)?/, "")}</Link> : c}
          </Text>
        ))}
      </Text>
    </View>
  );
}

function ResumeDoc({ resume, profile }: { resume: TailoredResume; profile: Profile }) {
  return (
    <Document title={`${profile.personal.fullName} - Resume`} author={profile.personal.fullName}>
      <Page size="A4" style={s.page}>
        <Header profile={profile} headline={resume.headline} />
        {resume.summary ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Summary</Text>
            <Text>{resume.summary}</Text>
          </View>
        ) : null}
        {resume.skills.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Skills</Text>
            {resume.skills.map((g, i) => (
              <Text key={i}>
                <Text style={s.bold}>{g.category}: </Text>
                {g.items.join(", ")}
              </Text>
            ))}
          </View>
        ) : null}
        {resume.experience.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Experience</Text>
            {resume.experience.map((e, i) => (
              <View key={i} style={s.item} wrap={false}>
                <View style={s.row}>
                  <Text style={s.bold}>
                    {e.title}
                    {e.company ? `, ${e.company}` : ""}
                  </Text>
                  <Text style={s.muted}>{[e.start, e.end].filter(Boolean).join(" – ")}</Text>
                </View>
                {e.location ? <Text style={s.muted}>{e.location}</Text> : null}
                <Bullets items={e.bullets} />
              </View>
            ))}
          </View>
        ) : null}
        {resume.projects.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Projects</Text>
            {resume.projects.map((p, i) => (
              <View key={i} style={s.item} wrap={false}>
                <View style={s.row}>
                  <Text style={s.bold}>
                    {p.name}
                    {p.tech ? <Text style={s.muted}> | {p.tech}</Text> : null}
                  </Text>
                  {p.link ? <Link src={p.link.startsWith("http") ? p.link : `https://${p.link}`}>{p.link.replace(/^https?:\/\/(www\.)?/, "")}</Link> : null}
                </View>
                <Bullets items={p.bullets} />
              </View>
            ))}
          </View>
        ) : null}
        {resume.education.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Education</Text>
            {resume.education.map((ed, i) => (
              <View key={i} style={s.item} wrap={false}>
                <View style={s.row}>
                  <Text style={s.bold}>
                    {ed.degree}
                    {ed.institution ? `, ${ed.institution}` : ""}
                  </Text>
                  <Text style={s.muted}>{[ed.start, ed.end].filter(Boolean).join(" – ")}</Text>
                </View>
                <Bullets items={ed.details} />
              </View>
            ))}
          </View>
        ) : null}
        {resume.certifications.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Certifications</Text>
            <Bullets items={resume.certifications} />
          </View>
        ) : null}
        {resume.extras.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Additional</Text>
            <Bullets items={resume.extras} />
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

function CoverLetterDoc({ letter, profile, company }: { letter: CoverLetter; profile: Profile; company: string }) {
  const date = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Document title={`${profile.personal.fullName} - Cover letter - ${company}`} author={profile.personal.fullName}>
      <Page size="A4" style={s.letterPage}>
        <Header profile={profile} headline="" />
        <Text style={{ marginTop: 24, marginBottom: 16 }}>{date}</Text>
        <Text style={s.para}>{letter.greeting}</Text>
        {letter.paragraphs.map((p, i) => (
          <Text key={i} style={s.para}>
            {p}
          </Text>
        ))}
        <Text style={{ marginTop: 6 }}>{letter.sign_off}</Text>
        <Text style={s.bold}>{profile.personal.fullName}</Text>
      </Page>
    </Document>
  );
}

export function renderResumePdf(resume: TailoredResume, profile: Profile) {
  return renderToBuffer(<ResumeDoc resume={resume} profile={profile} />);
}

export function renderCoverLetterPdf(letter: CoverLetter, profile: Profile, company: string) {
  return renderToBuffer(<CoverLetterDoc letter={letter} profile={profile} company={company} />);
}
