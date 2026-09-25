import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import {
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  RoleBadge,
  SearchField,
  SectionHead,
  formatDate,
  initials,
} from '../components/ui.jsx';

export default function CertificationHubPage() {
  const { user } = useAuth();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/certifications/hub');
      setMembers(data.members);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;

    return members
      .map((member) => {
        const matchesPerson = `${member.user.fullName} ${member.user.username}`
          .toLowerCase()
          .includes(term);
        const certifications = matchesPerson
          ? member.certifications
          : member.certifications.filter((certification) =>
              `${certification.name} ${certification.issuer ?? ''} ${certification.credentialId ?? ''}`
                .toLowerCase()
                .includes(term)
            );
        return { ...member, certifications };
      })
      .filter((member) => member.certifications.length > 0);
  }, [members, search]);

  const stats = useMemo(() => {
    const certifications = visible.reduce((sum, member) => sum + member.certifications.length, 0);
    const issuers = new Set(
      visible.flatMap((member) => member.certifications.map((item) => item.issuer).filter(Boolean))
    ).size;
    const shared = visible.reduce((sum, member) => sum + (member.certifications.some((c) => c.filePath) ? 1 : 0), 0);

    return [
      { label: 'certifications', value: certifications },
      { label: 'members', value: visible.length },
      { label: 'issuers', value: issuers },
      { label: 'with file', value: shared },
    ];
  }, [visible]);

  const totalCertifications = members.reduce((sum, member) => sum + member.certifications.length, 0);

  return (
    <>
      <Hero
        eyebrow="Achievement"
        title="Certification Hub"
        lead="Every certification the team has uploaded, grouped by member — so everyone can see who holds what."
        chips={['Team credentials', 'Read-only']}
        stats={stats}
        actions={
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSubmit={(event) => event.preventDefault()}
            placeholder="Search member, certification, issuer…"
            label="Search certifications"
          />
        }
      />

      <Notice tone="error">{error}</Notice>

      {loading ? (
        <Loading label="Loading the team's certifications" />
      ) : members.length === 0 ? (
        <Panel>
          <EmptyState
            icon="certificate"
            title="No certifications in the hub yet"
            hint="Once anyone uploads a certification on the Certification page, it will appear here for the whole team."
          />
        </Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            icon="search"
            title="No matches"
            hint={`Nothing matches “${search.trim()}”. Try another member or issuer.`}
          />
        </Panel>
      ) : (
        visible.map((member, index) => (
          <div key={member.user.id} style={{ marginBottom: index === visible.length - 1 ? 70 : 30 }}>
            <SectionHead
              eyebrow={`@${member.user.username}`}
              title={member.user.fullName}
              hint={`${member.certifications.length} certification${
                member.certifications.length === 1 ? '' : 's'
              }${member.user.id === user.id ? ' · uploaded by you' : ''}`}
              actions={<RoleBadge role={member.user.role} />}
            />

            <div className="cert-grid">
              {member.certifications.map((certification, index) => (
                <article
                  className="cert-card"
                  key={certification.id}
                  style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
                >
                  <span className="cert-card__seal" aria-hidden="true">
                    {initials(certification.issuer || certification.name)}
                  </span>

                  <div className="cert-card__body">
                    <h3 className="cert-card__name">{certification.name}</h3>
                    <p className="cert-card__issuer">{certification.issuer || 'issuer not set'}</p>

                    <div className="cert-card__facts">
                      <div className="cert-card__fact">
                        <p className="cert-card__fact-label">Credential</p>
                        <p className="cert-card__fact-value truncate">
                          {certification.credentialId || '—'}
                        </p>
                      </div>
                      <div className="cert-card__fact">
                        <p className="cert-card__fact-label">Issued</p>
                        <p className="cert-card__fact-value">{formatDate(certification.issuedDate)}</p>
                      </div>
                      <div className="cert-card__fact">
                        <p className="cert-card__fact-label">Expires</p>
                        <p className="cert-card__fact-value">{formatDate(certification.expiryDate)}</p>
                      </div>
                    </div>

                    <div className="cert-card__actions">
                      {certification.filePath ? (
                        <a
                          className="btn btn--outline btn--sm"
                          href={certification.filePath}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="external" size={14} />
                          View file
                        </a>
                      ) : (
                        <span className="muted">No file attached</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))
      )}

      {!loading && members.length > 0 ? (
        <Panel title="About this hub" style={{ marginTop: 60 }}>
          <p className="muted">
            {totalCertifications} certification{totalCertifications === 1 ? '' : 's'} across {members.length}{' '}
            active member{members.length === 1 ? '' : 's'}. Uploads are managed by each member on the
            Certification page; this hub is read-only.
          </p>
        </Panel>
      ) : null}
    </>
  );
}
