// Advanced Assertion Generator Engine
// Analyzes JSON response bodies and generates comprehensive Postman test scripts
// Uses rule-based AI: type inference, pattern recognition, schema analysis

class AssertionGenerator {

  constructor() {
    // Pattern matchers for smart detection
    this.patterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      url: /^https?:\/\/.+/,
      isoDate: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/,
      phone: /^\+?[\d\s\-()]{7,15}$/,
      ipv4: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
      hexColor: /^#[0-9a-fA-F]{6}$/,
      creditCard: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
      jwt: /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      base64: /^[A-Za-z0-9+/]+=*$/,
      semver: /^\d+\.\d+\.\d+$/,
      currency: /^[A-Z]{3}$/,
      countryCode: /^[A-Z]{2}$/,
      slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    };

    // Known field name patterns for semantic understanding
    this.fieldSemantics = {
      id: { type: 'identifier', assertions: ['exists', 'notEmpty'] },
      _id: { type: 'identifier', assertions: ['exists', 'notEmpty'] },
      name: { type: 'text', assertions: ['exists', 'isString', 'notEmpty'] },
      email: { type: 'email', assertions: ['exists', 'isString', 'matchesEmail'] },
      phone: { type: 'phone', assertions: ['exists', 'isString'] },
      status: { type: 'enum', assertions: ['exists', 'isString', 'oneOf'] },
      state: { type: 'enum', assertions: ['exists', 'isString', 'oneOf'] },
      type: { type: 'enum', assertions: ['exists', 'isString', 'oneOf'] },
      amount: { type: 'money', assertions: ['exists', 'isNumber', 'gte0'] },
      price: { type: 'money', assertions: ['exists', 'isNumber', 'gte0'] },
      total: { type: 'money', assertions: ['exists', 'isNumber', 'gte0'] },
      count: { type: 'counter', assertions: ['exists', 'isNumber', 'gte0', 'isInteger'] },
      quantity: { type: 'counter', assertions: ['exists', 'isNumber', 'gte0', 'isInteger'] },
      page: { type: 'counter', assertions: ['exists', 'isNumber', 'gte1', 'isInteger'] },
      limit: { type: 'counter', assertions: ['exists', 'isNumber', 'gte1', 'isInteger'] },
      created_at: { type: 'timestamp', assertions: ['exists', 'isString', 'isDate'] },
      updated_at: { type: 'timestamp', assertions: ['exists', 'isString', 'isDate'] },
      createdAt: { type: 'timestamp', assertions: ['exists', 'isString', 'isDate'] },
      updatedAt: { type: 'timestamp', assertions: ['exists', 'isString', 'isDate'] },
      timestamp: { type: 'timestamp', assertions: ['exists', 'isString', 'isDate'] },
      url: { type: 'url', assertions: ['exists', 'isString', 'matchesUrl'] },
      link: { type: 'url', assertions: ['exists', 'isString', 'matchesUrl'] },
      href: { type: 'url', assertions: ['exists', 'isString', 'matchesUrl'] },
      token: { type: 'token', assertions: ['exists', 'isString', 'notEmpty', 'minLength'] },
      password: { type: 'sensitive', assertions: ['notExposed'] },
      secret: { type: 'sensitive', assertions: ['notExposed'] },
      is_active: { type: 'boolean', assertions: ['exists', 'isBoolean'] },
      enabled: { type: 'boolean', assertions: ['exists', 'isBoolean'] },
      active: { type: 'boolean', assertions: ['exists', 'isBoolean'] },
      verified: { type: 'boolean', assertions: ['exists', 'isBoolean'] },
      description: { type: 'text', assertions: ['exists', 'isString'] },
      message: { type: 'text', assertions: ['exists', 'isString'] },
      error: { type: 'error', assertions: ['exists', 'isString'] },
      errors: { type: 'errorArray', assertions: ['exists', 'isArray'] },
      data: { type: 'container', assertions: ['exists'] },
      items: { type: 'list', assertions: ['exists', 'isArray'] },
      results: { type: 'list', assertions: ['exists', 'isArray'] },
      records: { type: 'list', assertions: ['exists', 'isArray'] }
    };
  }

  // Main generation function
  generate(responseBody, options = {}) {
    const {
      statusCode = 200,
      depth = 'deep', // 'shallow' | 'deep'
      style = 'balanced', // 'strict' | 'balanced' | 'flexible'
      includeSchema = true,
      includePerformance = true,
      includeNegative = true,
      variableName = 'json'
    } = options;

    let json;
    try {
      json = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
    } catch (e) {
      return { error: 'Invalid JSON: ' + e.message, assertions: [] };
    }

    const assertions = [];

    // 1. Status code assertion
    assertions.push(this._statusCodeAssertion(statusCode));

    // 2. Response time assertion
    if (includePerformance) {
      assertions.push(this._responseTimeAssertion());
    }

    // 3. Content-Type assertion
    assertions.push(this._contentTypeAssertion());

    // 4. Response body is valid JSON
    assertions.push(this._validJsonAssertion());

    // 5. Schema validation (required fields)
    if (includeSchema) {
      assertions.push(this._requiredFieldsAssertion(json, variableName));
    }

    // 6. Type assertions for each field
    const typeAssertions = this._generateTypeAssertions(json, variableName, '', depth, style);
    assertions.push(...typeAssertions);

    // 7. Array assertions
    const arrayAssertions = this._generateArrayAssertions(json, variableName, '');
    assertions.push(...arrayAssertions);

    // 8. Pattern-based assertions (email, UUID, date, etc.)
    const patternAssertions = this._generatePatternAssertions(json, variableName, '');
    assertions.push(...patternAssertions);

    // 9. Value-based assertions (enums, ranges)
    if (style === 'strict' || style === 'balanced') {
      const valueAssertions = this._generateValueAssertions(json, variableName, '', style);
      assertions.push(...valueAssertions);
    }

    // 10. Nested object assertions
    if (depth === 'deep') {
      const nestedAssertions = this._generateNestedAssertions(json, variableName, '');
      assertions.push(...nestedAssertions);
    }

    // 11. Negative assertions (security checks)
    if (includeNegative) {
      const negativeAssertions = this._generateNegativeAssertions(json, variableName);
      assertions.push(...negativeAssertions);
    }

    // 12. Null/undefined checks
    const nullChecks = this._generateNullChecks(json, variableName, '');
    assertions.push(...nullChecks);

    // Deduplicate and format
    const uniqueAssertions = this._deduplicate(assertions.filter(Boolean));

    return {
      error: null,
      assertions: uniqueAssertions,
      script: uniqueAssertions.map(a => a.code).join('\n\n'),
      summary: {
        total: uniqueAssertions.length,
        categories: this._categorize(uniqueAssertions)
      }
    };
  }

  _statusCodeAssertion(code) {
    return {
      category: 'status',
      description: `Status code is ${code}`,
      code: `pm.test("Status code is ${code}", function () {\n    pm.response.to.have.status(${code});\n});`
    };
  }

  _responseTimeAssertion() {
    return {
      category: 'performance',
      description: 'Response time is acceptable',
      code: `pm.test("Response time is less than 5000ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(5000);\n});`
    };
  }

  _contentTypeAssertion() {
    return {
      category: 'headers',
      description: 'Content-Type is JSON',
      code: `pm.test("Content-Type is application/json", function () {\n    pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");\n});`
    };
  }

  _validJsonAssertion() {
    return {
      category: 'schema',
      description: 'Response is valid JSON',
      code: `pm.test("Response is valid JSON", function () {\n    pm.response.to.be.json;\n});`
    };
  }

  _requiredFieldsAssertion(json, varName) {
    if (typeof json !== 'object' || json === null) return null;

    const keys = Array.isArray(json) ? [] : Object.keys(json);
    if (keys.length === 0) return null;

    const checks = keys.map(k => `    pm.expect(${varName}).to.have.property("${k}");`).join('\n');
    return {
      category: 'schema',
      description: 'Response has all required fields',
      code: `pm.test("Response has required fields", function () {\n    const ${varName} = pm.response.json();\n${checks}\n});`
    };
  }

  _generateTypeAssertions(json, varName, path, depth, style) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    if (Array.isArray(json)) {
      assertions.push({
        category: 'type',
        description: `${path || 'Response'} is an array`,
        code: `pm.test("${path || 'Response'} is an array", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${varName}${path}).to.be.an("array");\n});`
      });
      return assertions;
    }

    for (const [key, value] of Object.entries(json)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const accessor = `${varName}.${fieldPath}`;
      const type = this._getType(value);

      if (type === 'object' && depth === 'deep') {
        assertions.push({
          category: 'type',
          description: `${fieldPath} is an object`,
          code: `pm.test("${fieldPath} is an object", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.be.an("object");\n});`
        });
      } else if (type === 'array') {
        // Handled separately
      } else if (type !== 'object') {
        assertions.push({
          category: 'type',
          description: `${fieldPath} is a ${type}`,
          code: `pm.test("${fieldPath} is a ${type}", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.be.a("${type}");\n});`
        });
      }
    }

    return assertions;
  }

  _generateArrayAssertions(json, varName, path) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    for (const [key, value] of Object.entries(json)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const accessor = `${varName}.${fieldPath}`;

      if (Array.isArray(value)) {
        assertions.push({
          category: 'array',
          description: `${fieldPath} is a non-empty array`,
          code: `pm.test("${fieldPath} is a non-empty array", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.be.an("array").that.is.not.empty;\n});`
        });

        // If array has objects, check first item structure
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
          const itemKeys = Object.keys(value[0]);
          if (itemKeys.length > 0) {
            const checks = itemKeys.slice(0, 8).map(k => `    pm.expect(${accessor}[0]).to.have.property("${k}");`).join('\n');
            assertions.push({
              category: 'array',
              description: `${fieldPath} items have correct structure`,
              code: `pm.test("${fieldPath} items have correct structure", function () {\n    const ${varName} = pm.response.json();\n${checks}\n});`
            });
          }
        }

        // Array length assertion
        if (value.length > 0) {
          assertions.push({
            category: 'array',
            description: `${fieldPath} has items`,
            code: `pm.test("${fieldPath} has at least 1 item", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}.length).to.be.at.least(1);\n});`
          });
        }
      }
    }

    return assertions;
  }

  _generatePatternAssertions(json, varName, path) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    for (const [key, value] of Object.entries(json)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const accessor = `${varName}.${fieldPath}`;

      if (typeof value === 'string') {
        // Email detection
        if (this.patterns.email.test(value) || key.toLowerCase().includes('email')) {
          assertions.push({
            category: 'pattern',
            description: `${fieldPath} is a valid email`,
            code: `pm.test("${fieldPath} is a valid email", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/);\n});`
          });
        }
        // UUID detection
        else if (this.patterns.uuid.test(value)) {
          assertions.push({
            category: 'pattern',
            description: `${fieldPath} is a valid UUID`,
            code: `pm.test("${fieldPath} is a valid UUID", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);\n});`
          });
        }
        // ISO Date detection
        else if (this.patterns.isoDate.test(value)) {
          assertions.push({
            category: 'pattern',
            description: `${fieldPath} is a valid ISO date`,
            code: `pm.test("${fieldPath} is a valid date format", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(new Date(${accessor}).toString()).to.not.equal("Invalid Date");\n});`
          });
        }
        // URL detection
        else if (this.patterns.url.test(value) || key.toLowerCase().includes('url') || key.toLowerCase().includes('link')) {
          assertions.push({
            category: 'pattern',
            description: `${fieldPath} is a valid URL`,
            code: `pm.test("${fieldPath} is a valid URL", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.match(/^https?:\\/\\/.+/);\n});`
          });
        }
        // JWT detection
        else if (this.patterns.jwt.test(value)) {
          assertions.push({
            category: 'pattern',
            description: `${fieldPath} is a valid JWT`,
            code: `pm.test("${fieldPath} is a valid JWT format", function () {\n    const ${varName} = pm.response.json();\n    const parts = ${accessor}.split(".");\n    pm.expect(parts.length).to.equal(3);\n});`
          });
        }
        // Currency code detection
        else if (this.patterns.currency.test(value) && (key.toLowerCase().includes('currency') || key.toLowerCase().includes('curr'))) {
          assertions.push({
            category: 'pattern',
            description: `${fieldPath} is a valid currency code`,
            code: `pm.test("${fieldPath} is a valid 3-letter currency code", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.match(/^[A-Z]{3}$/);\n});`
          });
        }
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = this._generatePatternAssertions(value, varName, fieldPath);
        assertions.push(...nested);
      }
    }

    return assertions;
  }

  _generateValueAssertions(json, varName, path, style) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    for (const [key, value] of Object.entries(json)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const accessor = `${varName}.${fieldPath}`;
      const keyLower = key.toLowerCase();

      // Number range assertions
      if (typeof value === 'number') {
        if (keyLower.includes('amount') || keyLower.includes('price') || keyLower.includes('total') || keyLower.includes('cost')) {
          assertions.push({
            category: 'value',
            description: `${fieldPath} is non-negative`,
            code: `pm.test("${fieldPath} is non-negative", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.be.at.least(0);\n});`
          });
        }
        if (keyLower.includes('count') || keyLower.includes('quantity') || keyLower.includes('size') || keyLower.includes('length')) {
          assertions.push({
            category: 'value',
            description: `${fieldPath} is a non-negative integer`,
            code: `pm.test("${fieldPath} is a non-negative integer", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.be.at.least(0);\n    pm.expect(Number.isInteger(${accessor})).to.be.true;\n});`
          });
        }
        if (keyLower.includes('page')) {
          assertions.push({
            category: 'value',
            description: `${fieldPath} is at least 1`,
            code: `pm.test("${fieldPath} is at least 1", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.be.at.least(1);\n});`
          });
        }
        // Strict mode: assert exact value
        if (style === 'strict') {
          assertions.push({
            category: 'value',
            description: `${fieldPath} equals ${value}`,
            code: `pm.test("${fieldPath} equals ${value}", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.eql(${value});\n});`
          });
        }
      }

      // String enum assertions (short uppercase/lowercase strings that look like enums)
      if (typeof value === 'string' && value.length <= 30) {
        if (keyLower.includes('status') || keyLower.includes('state') || keyLower.includes('type') || keyLower.includes('role') || keyLower.includes('category')) {
          if (style === 'strict') {
            assertions.push({
              category: 'value',
              description: `${fieldPath} equals "${value}"`,
              code: `pm.test("${fieldPath} equals '${value}'", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.eql("${value}");\n});`
            });
          } else {
            assertions.push({
              category: 'value',
              description: `${fieldPath} is not empty`,
              code: `pm.test("${fieldPath} is not empty", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.not.be.empty;\n});`
            });
          }
        }
      }

      // Boolean assertions
      if (typeof value === 'boolean' && style === 'strict') {
        assertions.push({
          category: 'value',
          description: `${fieldPath} is ${value}`,
          code: `pm.test("${fieldPath} is ${value}", function () {\n    const ${varName} = pm.response.json();\n    pm.expect(${accessor}).to.eql(${value});\n});`
        });
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = this._generateValueAssertions(value, varName, fieldPath, style);
        assertions.push(...nested);
      }
    }

    return assertions;
  }

  _generateNestedAssertions(json, varName, path) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    for (const [key, value] of Object.entries(json)) {
      const fieldPath = path ? `${path}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nestedKeys = Object.keys(value);
        if (nestedKeys.length > 0) {
          const checks = nestedKeys.map(k => `    pm.expect(${varName}.${fieldPath}).to.have.property("${k}");`).join('\n');
          assertions.push({
            category: 'nested',
            description: `${fieldPath} object has required properties`,
            code: `pm.test("${fieldPath} has required properties", function () {\n    const ${varName} = pm.response.json();\n${checks}\n});`
          });
        }
      }
    }

    return assertions;
  }

  _generateNegativeAssertions(json, varName) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    const sensitiveFields = ['password', 'secret', 'private_key', 'api_key', 'apiKey', 'ssn', 'credit_card', 'cvv', 'pin'];
    const keys = this._getAllKeys(json);

    for (const field of sensitiveFields) {
      if (keys.includes(field)) {
        assertions.push({
          category: 'security',
          description: `Sensitive field "${field}" should not be exposed`,
          code: `pm.test("Sensitive field '${field}' is not exposed in response", function () {\n    const ${varName} = pm.response.json();\n    // WARNING: This field may contain sensitive data\n    // Consider removing it from the API response\n    pm.expect(JSON.stringify(${varName})).to.not.include("${field}");\n});`
        });
      }
    }

    // Check response doesn't contain stack traces
    assertions.push({
      category: 'security',
      description: 'Response does not contain stack traces',
      code: `pm.test("Response does not expose stack traces", function () {\n    const body = pm.response.text();\n    pm.expect(body).to.not.include("at Object.");\n    pm.expect(body).to.not.include("node_modules");\n});`
    });

    return assertions;
  }

  _generateNullChecks(json, varName, path) {
    const assertions = [];
    if (typeof json !== 'object' || json === null) return assertions;

    const nullFields = [];
    const nonNullFields = [];

    for (const [key, value] of Object.entries(json)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (value === null) {
        nullFields.push(fieldPath);
      } else if (typeof value !== 'object') {
        nonNullFields.push(fieldPath);
      }
    }

    // Assert non-null fields are not null
    if (nonNullFields.length > 0) {
      const checks = nonNullFields.slice(0, 10).map(f => `    pm.expect(${varName}.${f}).to.not.be.null;`).join('\n');
      assertions.push({
        category: 'null-check',
        description: 'Required fields are not null',
        code: `pm.test("Required fields are not null", function () {\n    const ${varName} = pm.response.json();\n${checks}\n});`
      });
    }

    return assertions;
  }

  // Helper methods
  _getType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  _getAllKeys(obj, prefix = '') {
    let keys = [];
    for (const [key, value] of Object.entries(obj)) {
      keys.push(key);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        keys = keys.concat(this._getAllKeys(value, prefix + key + '.'));
      }
    }
    return keys;
  }

  _deduplicate(assertions) {
    const seen = new Set();
    return assertions.filter(a => {
      if (seen.has(a.description)) return false;
      seen.add(a.description);
      return true;
    });
  }

  _categorize(assertions) {
    const cats = {};
    for (const a of assertions) {
      cats[a.category] = (cats[a.category] || 0) + 1;
    }
    return cats;
  }
}

module.exports = AssertionGenerator;
