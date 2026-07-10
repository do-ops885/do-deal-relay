# Add coverage generation

> Extracted from ../SKILL.md; see primary for context.


Add the minimal configuration to generate coverage reports in a format Codacy supports. Choose the format based on the language and tooling. See [references/coverage-formats.md](references/coverage-formats.md) for the full format reference.

## Language-specific setup

**JavaScript/TypeScript (Jest):**

```json
// In package.json or jest.config.js
{
  "collectCoverage": true,
  "coverageReporters": ["lcov"]
}
```

Or run: `npx jest --coverage --coverageReporters=lcov`

**JavaScript/TypeScript (Vitest):**

```js
// vitest.config.ts
{ test: { coverage: { reporter: ['lcov'] } } }
```

**Python (pytest + coverage.py):**

```bash
pip install pytest-cov
pytest --cov --cov-report=xml:cobertura.xml
```

**Java (Maven + JaCoCo):**

Add the JaCoCo Maven plugin to `pom.xml`:

```xml
<plugin>
  <groupId>org.jacoco</groupId>
  <artifactId>jacoco-maven-plugin</artifactId>
  <version>0.8.12</version>
  <executions>
    <execution>
      <goals><goal>prepare-agent</goal></goals>
    </execution>
    <execution>
      <id>report</id>
      <phase>test</phase>
      <goals><goal>report</goal></goals>
    </execution>
  </executions>
</plugin>
```

**Java (Gradle + JaCoCo):**

```gradle
plugins { id 'jacoco' }
jacocoTestReport { dependsOn test }
```

Run: `./gradlew test jacocoTestReport`

**Kotlin (Gradle + JaCoCo):**

```gradle
plugins { id 'jacoco' }
jacocoTestReport {
  dependsOn test
  reports { xml.required = true }
}
```

Run: `./gradlew test jacocoTestReport`

Report location: `build/reports/jacoco/test/jacocoTestReport.xml`

**Kotlin (Maven + JaCoCo):**

Same as Java Maven + JaCoCo setup above — JaCoCo supports Kotlin bytecode natively.

**Android (Gradle + JaCoCo):**

```gradle
android {
  buildTypes {
    debug { testCoverageEnabled true }
  }
}
```

Run: `./gradlew createDebugCoverageReport`

Report location: `app/build/reports/coverage/debug/report.xml`

For multi-module Android projects, use a merged report or partial uploads (see [references/coverage-upload.md](references/coverage-upload.md)).

**Go:**

```bash
go test -coverprofile=coverage.out ./...
```

**Ruby (SimpleCov):**

```ruby
# At the top of spec/spec_helper.rb or test/test_helper.rb
require 'simplecov'
SimpleCov.start
SimpleCov.formatter = SimpleCov::Formatter::CoberturaFormatter
```

Requires `simplecov` and `simplecov-cobertura` gems.

**C#/.NET (Coverlet):**

```bash
dotnet test --collect:"XPlat Code Coverage" -- DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura
```

**Scala (sbt-jacoco):**

Add to `project/plugins.sbt`:

```scala
addSbtPlugin("com.github.sbt" % "sbt-jacoco" % "3.5.0")
```

Run: `sbt jacoco`

**PHP (PHPUnit):**

```bash
phpunit --coverage-clover clover.xml
```

