const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');

// Import the Main CLI class
const Main = require('../src/cli/cli');

// Import individual commands
const commands = require('../src/cli/commands');

describe('CLI Commands', function() {
  let main;
  let consoleLogStub;
  let processExitStub;

  beforeEach(function() {
    // Create a new Main instance for each test
    main = new Main();
    
    // Stub console.log to capture output
    consoleLogStub = sinon.stub(console, 'log');
    
    // Stub process.exit to prevent tests from exiting
    processExitStub = sinon.stub(process, 'exit');
  });

  afterEach(function() {
    // Restore stubs
    consoleLogStub.restore();
    processExitStub.restore();
  });

  describe('VersionCommand', function() {
    it('should display the correct version', async function() {
      const versionCmd = new commands.VersionCommand(main);
      main.packageJSON = { version: '5.0.3' };
      
      await versionCmd.execute();
      
      expect(consoleLogStub.calledWith('Backend manager is version: 5.0.3')).to.be.true;
    });
  });

  describe('CwdCommand', function() {
    it('should display the current working directory', async function() {
      const cwdCmd = new commands.CwdCommand(main);
      main.firebaseProjectPath = '/test/path';
      
      await cwdCmd.execute();
      
      // Check that console.log was called with two arguments: 'cwd: ' and the path
      expect(consoleLogStub.calledOnce).to.be.true;
      const callArgs = consoleLogStub.getCall(0).args;
      expect(callArgs[0]).to.equal('cwd: ');
      expect(callArgs[1]).to.equal('/test/path');
    });
  });

  describe('ClearCommand', function() {
    it('should clear the console', async function() {
      const clearCmd = new commands.ClearCommand(main);
      const writeSpy = sinon.spy(process.stdout, 'write');
      const clearSpy = sinon.spy(console, 'clear');
      
      await clearCmd.execute();
      
      expect(writeSpy.called).to.be.true;
      expect(clearSpy.called).to.be.true;
      
      writeSpy.restore();
      clearSpy.restore();
    });
  });

  describe('Main CLI process method', function() {
    it('should handle version flag correctly', async function() {
      main.packageJSON = { version: '5.0.3' };
      
      await main.process(['version']);
      
      expect(consoleLogStub.calledWith('Backend manager is version: 5.0.3')).to.be.true;
    });

    it('should handle cwd flag correctly', async function() {
      await main.process(['cwd']);
      
      expect(consoleLogStub.calledWithMatch('cwd: ')).to.be.true;
    });

    it('should parse multiple arguments correctly', async function() {
      main.packageJSON = { version: '5.0.3' };
      
      await main.process(['v']);
      
      expect(main.options.v).to.be.true;
      expect(consoleLogStub.calledWith('Backend manager is version: 5.0.3')).to.be.true;
    });
  });

  describe('InstallCommand', function() {
    let execStub;
    
    beforeEach(function() {
      const powertools = require('node-powertools');
      execStub = sinon.stub(powertools, 'execute').resolves();
    });
    
    afterEach(function() {
      execStub.restore();
    });

    it('should uninstall and install local backend-manager', async function() {
      const installCmd = new commands.InstallCommand(main);
      
      await installCmd.execute('local');
      
      expect(execStub.calledWith('npm uninstall backend-manager')).to.be.true;
      expect(execStub.calledWithMatch(/npm install.*backend-manager --save-dev/)).to.be.true;
    });

    it('should uninstall and install live backend-manager', async function() {
      const installCmd = new commands.InstallCommand(main);
      
      await installCmd.execute('live');
      
      expect(execStub.calledWith('npm uninstall backend-manager')).to.be.true;
      expect(execStub.calledWith('npm i backend-manager@latest')).to.be.true;
    });
  });

  describe('CleanCommand', function() {
    let execStub;
    
    beforeEach(function() {
      const powertools = require('node-powertools');
      execStub = sinon.stub(powertools, 'execute').resolves();
    });
    
    afterEach(function() {
      execStub.restore();
    });

    it('should execute the clean npm script', async function() {
      const cleanCmd = new commands.CleanCommand(main);
      
      await cleanCmd.execute();
      
      expect(execStub.calledWithMatch(/rm -fr node_modules/)).to.be.true;
    });
  });

  describe('ConfigCommand', function() {
    let execStub;
    let originalRequire;
    
    beforeEach(function() {
      const powertools = require('node-powertools');
      execStub = sinon.stub(powertools, 'execute').resolves();
      
      // Mock require for config file - simplified approach
      const Module = require('module');
      originalRequire = Module.prototype.require;
      sinon.stub(Module.prototype, 'require').callsFake(function(id) {
        if (id.includes('.runtimeconfig.json')) {
          return { test: 'config' };
        }
        return originalRequire.apply(this, arguments);
      });
    });
    
    afterEach(function() {
      execStub.restore();
      
      // Restore original require
      const Module = require('module');
      Module.prototype.require.restore();
    });

    it('should get firebase config', async function() {
      const configCmd = new commands.ConfigCommand(main);
      main.firebaseProjectPath = '/test/project';
      
      const config = await configCmd.get();
      
      expect(execStub.calledWithMatch(/firebase functions:config:get/)).to.be.true;
      expect(config).to.deep.equal({ test: 'config' });
    });
  });

  describe('IndexesCommand', function() {
    let execStub;
    let requireStub;
    
    beforeEach(function() {
      const powertools = require('node-powertools');
      execStub = sinon.stub(powertools, 'execute').resolves();
      
      // Mock require for indexes file - simplified approach
      const Module = require('module');
      const originalRequire = Module.prototype.require;
      requireStub = sinon.stub(Module.prototype, 'require').callsFake(function(id) {
        if (id.includes('firestore.indexes.json')) {
          return { indexes: [] };
        }
        return originalRequire.apply(this, arguments);
      });
    });
    
    afterEach(function() {
      execStub.restore();
      requireStub.restore();
    });

    it('should get firestore indexes', async function() {
      const indexesCmd = new commands.IndexesCommand(main);
      main.firebaseProjectPath = '/test/project';
      
      const indexes = await indexesCmd.get();
      
      expect(execStub.calledWithMatch(/firebase firestore:indexes/)).to.be.true;
      expect(indexes).to.deep.equal({ indexes: [] });
    });
  });
});