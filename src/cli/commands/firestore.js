const BaseCommand = require('./base-command');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { initFirebase } = require('./firebase-init');

class FirestoreCommand extends BaseCommand {
  async execute() {
    const argv = this.main.argv;
    const args = argv._ || [];
    const subcommand = args[0]; // e.g., 'firestore:get'
    const action = subcommand.split(':')[1];

    // Initialize Firebase
    const isEmulator = argv.emulator || false;
    let firebase;

    try {
      firebase = initFirebase({
        firebaseProjectPath: this.firebaseProjectPath,
        emulator: isEmulator,
      });
    } catch (error) {
      this.logError(`Firebase init failed: ${error.message}`);
      return;
    }

    const { admin, projectId } = firebase;
    const target = isEmulator ? 'emulator' : 'production';
    this.log(chalk.gray(`  Target: ${projectId} (${target})\n`));

    // Dispatch to subcommand handler
    switch (action) {
      case 'get':
        return await this.get(admin, args, argv);
      case 'set':
        return await this.set(admin, args, argv);
      case 'query':
        return await this.query(admin, args, argv);
      case 'delete':
        return await this.del(admin, args, argv, isEmulator);
      default:
        this.logError(`Unknown firestore subcommand: ${action}`);
        this.log(chalk.gray('  Available: firestore:get, firestore:set, firestore:query, firestore:delete'));
    }
  }

  /**
   * Read a document by path.
   * Usage: npx bm firestore:get users/abc123
   */
  async get(admin, args, argv) {
    const docPath = args[1];

    if (!docPath) {
      this.logError('Missing document path. Usage: npx bm firestore:get <path>');
      return;
    }

    // Validate path is a document (even number of segments), not a collection
    const segments = docPath.split('/').filter(Boolean);
    if (segments.length % 2 !== 0) {
      this.logError(`Path "${docPath}" points to a collection, not a document.`);
      this.log(chalk.gray('  Use firestore:query to list collection documents.'));
      return;
    }

    try {
      const doc = await admin.firestore().doc(docPath).get();

      if (!doc.exists) {
        this.logWarning(`Document does not exist: ${docPath}`);
        return;
      }

      this.output({ id: doc.id, path: doc.ref.path, data: doc.data() }, argv);
    } catch (error) {
      this.logError(`Failed to read document: ${error.message}`);
    }
  }

  /**
   * Write/merge to a document.
   * Usage: npx bm firestore:set users/abc123 '{"field": "value"}'
   */
  async set(admin, args, argv) {
    const docPath = args[1];
    const jsonString = args[2];

    if (!docPath || !jsonString) {
      this.logError('Usage: npx bm firestore:set <path> \'<json>\'');
      return;
    }

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (error) {
      this.logError(`Invalid JSON: ${error.message}`);
      return;
    }

    const merge = argv.merge !== false; // merge by default, --no-merge to overwrite

    try {
      await admin.firestore().doc(docPath).set(data, { merge });
      this.logSuccess(`Document written: ${docPath} (merge: ${merge})`);
      this.output(data, argv);
    } catch (error) {
      this.logError(`Failed to write document: ${error.message}`);
    }
  }

  /**
   * Query a collection.
   * Usage: npx bm firestore:query users --where "plan==premium" --limit 10
   */
  async query(admin, args, argv) {
    const collectionPath = args[1];

    if (!collectionPath) {
      this.logError('Usage: npx bm firestore:query <collection> [--where "field==value"] [--limit N]');
      return;
    }

    try {
      let query = admin.firestore().collection(collectionPath);

      // Parse --where clauses (can be repeated for AND)
      const whereClauses = this.parseWhereClauses(argv);
      for (const { field, operator, value } of whereClauses) {
        query = query.where(field, operator, value);
      }

      // Parse --orderBy
      if (argv.orderBy) {
        const [field, direction] = argv.orderBy.split(':');
        query = query.orderBy(field, direction || 'asc');
      }

      // Parse --limit (default 25)
      const limit = parseInt(argv.limit, 10) || 25;
      query = query.limit(limit);

      const snapshot = await query.get();

      if (snapshot.empty) {
        this.logWarning('No documents found.');
        return;
      }

      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        path: doc.ref.path,
        data: doc.data(),
      }));

      this.log(chalk.gray(`  Found ${results.length} document(s)\n`));
      this.output(results, argv);
    } catch (error) {
      this.logError(`Query failed: ${error.message}`);
    }
  }

  /**
   * Delete a document.
   * Usage: npx bm firestore:delete users/abc123 [--force]
   */
  async del(admin, args, argv, isEmulator) {
    const docPath = args[1];

    if (!docPath) {
      this.logError('Usage: npx bm firestore:delete <path> [--force]');
      return;
    }

    // Require confirmation for production (skip for emulator or --force)
    if (!isEmulator && !argv.force) {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Delete document "${docPath}" from PRODUCTION?`,
        default: false,
      }]);

      if (!confirmed) {
        this.log(chalk.gray('  Aborted.'));
        return;
      }
    }

    try {
      await admin.firestore().doc(docPath).delete();
      this.logSuccess(`Document deleted: ${docPath}`);
    } catch (error) {
      this.logError(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Parse --where flag(s) into Firestore query clauses.
   * Supports: "field==value", "field>value", "field>=value", etc.
   * Multiple --where flags create AND conditions.
   */
  parseWhereClauses(argv) {
    if (!argv.where) {
      return [];
    }

    // yargs: single --where gives string, multiple gives array
    const rawClauses = Array.isArray(argv.where) ? argv.where : [argv.where];
    const operators = ['>=', '<=', '!=', '==', '>', '<'];

    return rawClauses.map(clause => {
      for (const op of operators) {
        const idx = clause.indexOf(op);

        if (idx === -1) {
          continue;
        }

        const field = clause.substring(0, idx).trim();
        const rawValue = clause.substring(idx + op.length).trim();

        return { field, operator: op, value: this.coerceValue(rawValue) };
      }

      throw new Error(`Cannot parse --where clause: "${clause}". Use format: "field==value"`);
    });
  }

  /**
   * Coerce a string value to the appropriate JS type.
   */
  coerceValue(raw) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

    // Strip surrounding quotes if present
    if ((raw.startsWith('"') && raw.endsWith('"'))
      || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }

    return raw;
  }

  /**
   * Output data as JSON.
   */
  output(data, argv) {
    if (argv.raw) {
      this.log(JSON.stringify(data));
    } else {
      this.log(JSON.stringify(data, null, 2));
    }
  }
}

module.exports = FirestoreCommand;
