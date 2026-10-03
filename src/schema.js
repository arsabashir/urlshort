// Creates tables if they do not exist. Times are stored as epoch milliseconds
// so the same code works on both SQLite (dev/test) and MySQL (production).
async function ensureSchema(db) {
  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', (t) => {
      t.increments('id');
      t.string('email', 255).notNullable().unique();
      t.string('password_hash', 255).notNullable();
      t.bigInteger('created_at').notNullable();
    });
  }

  if (!(await db.schema.hasTable('links'))) {
    await db.schema.createTable('links', (t) => {
      t.increments('id');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('code', 32).notNullable().unique();
      t.string('target_url', 2048).notNullable();
      t.integer('click_count').notNullable().defaultTo(0);
      t.bigInteger('created_at').notNullable();
      t.bigInteger('expires_at').nullable();
      t.index(['user_id', 'created_at']);
    });
  }

  if (!(await db.schema.hasTable('clicks'))) {
    await db.schema.createTable('clicks', (t) => {
      t.increments('id');
      t.integer('link_id').unsigned().notNullable().references('id').inTable('links').onDelete('CASCADE');
      t.bigInteger('clicked_at').notNullable();
      t.string('referrer', 512).nullable();
      t.string('user_agent', 512).nullable();
      t.index(['link_id', 'clicked_at']);
    });
  }
}

module.exports = { ensureSchema };
