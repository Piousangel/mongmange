// EAS 무료 빌더에서 네이티브(C++) 모듈이 많아 Gradle 데몬이 메모리 부족으로 죽는 문제 대응.
// gradle.properties에 직접 써야 데몬 JVM 설정이 적용된다(GRADLE_OPTS의 -D jvmargs는 데몬에 안 먹음).
const { withGradleProperties } = require('expo/config-plugins');

const PROPS = {
  'org.gradle.jvmargs': '-Xmx2048m -XX:MaxMetaspaceSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
  'org.gradle.workers.max': '1',
  'org.gradle.parallel': 'false',
  'kotlin.compiler.execution.strategy': 'in-process',
};

module.exports = function withLowMemoryGradle(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
