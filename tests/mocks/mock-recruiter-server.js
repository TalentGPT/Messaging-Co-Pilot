/**
 * Mock Recruiter Server — serves mock LinkedIn Recruiter pages for E2E testing
 */
const express = require('express');
const path = require('path');
const http = require('http');

function createMockRecruiterServer() {
  const app = express();

  // Serve mock recruiter page
  app.get('/talent/hire/:projectId', (req, res) => {
    res.sendFile(path.join(__dirname, 'mock-recruiter-page.html'));
  });

  app.get('/talent/profile/:profileId', (req, res) => {
    res.json({
      id: req.params.profileId,
      name: 'Mock Profile',
      headline: 'Test Engineer at TestCorp',
    });
  });

  // Serve static mock page
  app.get('/mock-recruiter', (req, res) => {
    res.sendFile(path.join(__dirname, 'mock-recruiter-page.html'));
  });

  // Scenario-specific endpoints
  app.get('/scenario/:name', (req, res) => {
    const scenario = req.params.name;
    const html = `<!DOCTYPE html><html><body>
      <div class="row__top-card" data-scenario="${scenario}">
        <a href="/talent/profile/test123"><span class="candidate-name">Test ${scenario}</span></a>
        <span class="headline">Test Headline</span>
      </div>
    </body></html>`;
    res.send(html);
  });

  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        baseUrl: `http://localhost:${port}`,
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

module.exports = { createMockRecruiterServer };
