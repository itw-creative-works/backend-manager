/**
 * DELETE /marketing/contact - Remove marketing contact
 * Admin-only endpoint to unsubscribe from newsletter
 */
const fetch = require('wonderful-fetch');

module.exports = async ({ assistant, Manager, settings, analytics }) => {

  // Initialize Usage to check auth level
  const usage = await Manager.Usage().init(assistant, {
    unauthenticatedMode: 'firestore',
  });
  const isAdmin = usage.user.roles?.admin;

  // Admin only endpoint
  if (!isAdmin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  // Extract parameters
  const email = (settings.email || '').trim().toLowerCase();
  const providers = settings.providers;

  // Validate email is provided
  if (!email) {
    return assistant.respond('Email is required', { code: 400 });
  }

  // Get brand name from Manager config
  const brandName = Manager.config.brand?.name;

  // Remove from providers
  const providerResults = {};

  // SendGrid
  if (providers.includes('sendgrid') && process.env.SENDGRID_API_KEY) {
    providerResults.sendgrid = await removeFromSendGrid(email);
  }

  // Beehiiv
  if (providers.includes('beehiiv') && process.env.BEEHIIV_API_KEY) {
    providerResults.beehiiv = await removeFromBeehiiv(email, brandName);
  }

  // Log result
  assistant.log('marketing/contact delete result:', {
    email,
    providers: providerResults,
  });

  // Track analytics
  analytics.event('marketing/contact', { action: 'delete' });

  return assistant.respond({
    success: true,
    providers: providerResults,
  });
};

// Helper: Remove contact from SendGrid
async function removeFromSendGrid(email) {
  try {
    // Step 1: Get contact ID by email
    const searchData = await fetch('https://api.sendgrid.com/v3/marketing/contacts/search/emails', {
      method: 'post',
      response: 'json',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
      timeout: 10000,
      body: { emails: [email] },
    });

    if (!searchData.result?.[email]?.contact?.id) {
      return { success: true, skipped: true, reason: 'Contact not found' };
    }

    const contactId = searchData.result[email].contact.id;

    // Step 2: Delete contact by ID
    const deleteData = await fetch(`https://api.sendgrid.com/v3/marketing/contacts?ids=${contactId}`, {
      method: 'delete',
      response: 'json',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
      timeout: 10000,
    });

    if (deleteData.job_id) {
      return { success: true, jobId: deleteData.job_id };
    }

    return { success: false, error: deleteData.errors?.[0]?.message || 'Delete failed' };
  } catch (e) {
    console.error('SendGrid remove error:', e);
    return { success: false, error: e.message };
  }
}

// Helper: Get Beehiiv publication ID by brand name
async function getBeehiivPublicationId(brandName) {
  if (!brandName) {
    console.error('Beehiiv: Brand name is required to find publication');
    return null;
  }

  const brandNameLower = brandName.toLowerCase();
  const allPublications = [];
  let page = 1;
  const limit = 100;

  try {
    while (true) {
      const data = await fetch(`https://api.beehiiv.com/v2/publications?limit=${limit}&page=${page}`, {
        response: 'json',
        headers: {
          'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
        },
        timeout: 10000,
      });

      if (!data.data || data.data.length === 0) {
        break;
      }

      const matchedPub = data.data.find(pub =>
        pub.name.toLowerCase() === brandNameLower
        || pub.name.toLowerCase().includes(brandNameLower)
        || brandNameLower.includes(pub.name.toLowerCase())
      );

      if (matchedPub) {
        return matchedPub.id;
      }

      allPublications.push(...data.data);

      if (data.data.length < limit) {
        break;
      }

      page++;
    }

    console.error(`Beehiiv: No publication matched brand "${brandName}". Available: ${allPublications.map(p => p.name).join(', ')}`);
  } catch (e) {
    console.error('Beehiiv publication lookup error:', e);
  }

  return null;
}

// Helper: Remove contact from Beehiiv
async function removeFromBeehiiv(email, brandName) {
  try {
    const pubId = await getBeehiivPublicationId(brandName);
    if (!pubId) {
      return { success: false, error: `Publication not found for brand "${brandName}"` };
    }

    // Step 1: Get subscription by email
    const encodedEmail = encodeURIComponent(email);

    let searchData;
    try {
      searchData = await fetch(
        `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/by_email/${encodedEmail}`,
        {
          response: 'json',
          headers: {
            'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
          },
          timeout: 10000,
        }
      );
    } catch (e) {
      if (e.status === 404) {
        return { success: true, skipped: true, reason: 'Subscriber not found' };
      }
      throw e;
    }

    if (!searchData.data?.id) {
      return { success: true, skipped: true, reason: 'Subscription not found' };
    }

    const subscriptionId = searchData.data.id;

    // Step 2: Permanently DELETE the subscription
    await fetch(
      `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${subscriptionId}`,
      {
        method: 'delete',
        headers: {
          'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
        },
        timeout: 10000,
      }
    );

    return { success: true, deleted: true, subscriptionId };
  } catch (e) {
    console.error('Beehiiv remove error:', e);
    return { success: false, error: e.message };
  }
}
