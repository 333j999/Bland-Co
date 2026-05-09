// Usage: RESEND_API_KEY=re_xxx node test-email.js [enquiry|valuation|consultation]
process.env.RESEND_FROM = process.env.RESEND_FROM || 'Bland & Co <onboarding@resend.dev>';
const { sendSubmissionEmails } = require('./api/_lib/email');

const type = process.argv[2] || 'enquiry';

const samples = {
  enquiry: {
    resource: 'enquiries',
    item: {
      name: 'Test User',
      email: process.env.TEST_EMAIL || 'soracrt@outlook.com',
      phone: '+44 7700 900000',
      subject: 'Test enquiry',
      message: 'This is a test submission from test-email.js',
      createdAt: new Date().toISOString(),
    },
  },
  valuation: {
    resource: 'valuations',
    item: {
      fullName: 'Test User',
      email: process.env.TEST_EMAIL || 'soracrt@outlook.com',
      phone: '+44 7700 900000',
      itemType: 'Watch',
      brand: 'Rolex',
      model: 'Submariner',
      year: '2020',
      condition: 'Excellent',
      accessories: 'Box and papers',
      description: 'Test valuation submission',
      createdAt: new Date().toISOString(),
    },
  },
  consultation: {
    resource: 'consultations',
    item: {
      name: 'Test User',
      email: process.env.TEST_EMAIL || 'soracrt@outlook.com',
      phone: '+44 7700 900000',
      purpose: 'buying',
      preferredDate: '2026-05-01',
      preferredTime: '11:00',
      message: 'Test consultation booking',
      createdAt: new Date().toISOString(),
    },
  },
};

const sample = samples[type];
if (!sample) {
  console.error(`Unknown type "${type}". Use: enquiry, valuation, or consultation`);
  process.exit(1);
}

console.log(`Sending test "${type}" emails...`);
sendSubmissionEmails(sample.resource, sample.item)
  .then(() => console.log('Done — check your inbox.'))
  .catch(err => { console.error('Failed:', err.message); process.exit(1); });
