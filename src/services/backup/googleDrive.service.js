const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const config = require('../../config/index.config');
const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const {
  GOOGLE_DRIVE_ROOT_FOLDER,
  GOOGLE_DRIVE_SCOPES,
} = require('./backup.constants');

const assertGoogleConfigured = () => {
  if (!config.isGoogleDriveConfigured) {
    throw new AppError(
      'Google Drive is not configured on the server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
      503,
      'GOOGLE_NOT_CONFIGURED'
    );
  }
};

const createOAuthClient = () => {
  assertGoogleConfigured();
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  );
};

const buildConnectState = (userId) =>
  jwt.sign({ userId, purpose: 'google_drive_connect' }, config.JWT_SECRET, { expiresIn: '15m' });

const verifyConnectState = (state) => {
  try {
    const payload = jwt.verify(state, config.JWT_SECRET);
    if (payload.purpose !== 'google_drive_connect' || !payload.userId) {
      throw new Error('Invalid state purpose');
    }
    return payload;
  } catch {
    throw new AppError('Invalid or expired Google OAuth state', 400, 'INVALID_OAUTH_STATE');
  }
};

const getAuthUrl = (userId) => {
  const client = createOAuthClient();
  const state = buildConnectState(userId);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_DRIVE_SCOPES,
    state,
  });
};

const saveTokensForUser = async (userId, tokens, profile = {}) => {
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return prisma.userGoogleDriveToken.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: expiresAt,
      google_email: profile.email || null,
      google_account_id: profile.id || null,
      scopes: GOOGLE_DRIVE_SCOPES.join(' '),
    },
    update: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      expires_at: expiresAt,
      google_email: profile.email || undefined,
      google_account_id: profile.id || undefined,
      scopes: GOOGLE_DRIVE_SCOPES.join(' '),
    },
  });
};

const exchangeCodeForTokens = async (code, state) => {
  const { userId } = verifyConnectState(state);
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  await saveTokensForUser(userId, tokens, profile);
  return { userId, email: profile.email || null };
};

const getStoredToken = async (userId) =>
  prisma.userGoogleDriveToken.findUnique({ where: { user_id: userId } });

const getAuthorizedClient = async (userId) => {
  const stored = await getStoredToken(userId);
  if (!stored) {
    throw new AppError('Google Drive is not connected for this account', 400, 'GOOGLE_NOT_CONNECTED');
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expires_at.getTime(),
  });

  client.on('tokens', async (tokens) => {
    if (!tokens.access_token) return;
    await prisma.userGoogleDriveToken.update({
      where: { user_id: userId },
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || undefined,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });
  });

  return { client, stored };
};

const findOrCreateFolder = async (drive, name, parentId = null) => {
  const qParts = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${name.replace(/'/g, "\\'")}'`,
    'trashed=false',
  ];
  if (parentId) qParts.push(`'${parentId}' in parents`);
  else qParts.push("'root' in parents");

  const existing = await drive.files.list({
    q: qParts.join(' and '),
    fields: 'files(id,name)',
    pageSize: 1,
  });

  if (existing.data.files?.[0]?.id) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });

  return created.data.id;
};

const resolveBackupFolderId = async (drive, scope) => {
  const rootId = await findOrCreateFolder(drive, GOOGLE_DRIVE_ROOT_FOLDER);
  const roleFolder = await findOrCreateFolder(drive, scope.role, rootId);
  const scopeKey = scope.shop_id || scope.warehouse_id || 'full_system';
  return findOrCreateFolder(drive, scopeKey, roleFolder);
};

const uploadBackupFile = async (userId, scope, filename, buffer) => {
  const { client } = await getAuthorizedClient(userId);
  const drive = google.drive({ version: 'v3', auth: client });
  const folderId = await resolveBackupFolderId(drive, scope);

  const uploaded = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/zip',
      body: require('stream').Readable.from(buffer),
    },
    fields: 'id,name,size,createdTime',
  });

  return uploaded.data;
};

const downloadBackupFile = async (userId, fileId) => {
  const { client } = await getAuthorizedClient(userId);
  const drive = google.drive({ version: 'v3', auth: client });
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data);
};

const deleteBackupFile = async (userId, fileId) => {
  const { client } = await getAuthorizedClient(userId);
  const drive = google.drive({ version: 'v3', auth: client });
  await drive.files.delete({ fileId });
};

const getConnectionStatus = async (userId) => {
  const stored = await getStoredToken(userId);
  if (!stored) {
    return { connected: false, configured: config.isGoogleDriveConfigured };
  }
  return {
    connected: true,
    configured: config.isGoogleDriveConfigured,
    email: stored.google_email,
    connected_at: stored.created_at,
    updated_at: stored.updated_at,
  };
};

const disconnect = async (userId) => {
  await prisma.userGoogleDriveToken.deleteMany({ where: { user_id: userId } });
  return { connected: false };
};

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getConnectionStatus,
  disconnect,
  uploadBackupFile,
  downloadBackupFile,
  deleteBackupFile,
  assertGoogleConfigured,
};
