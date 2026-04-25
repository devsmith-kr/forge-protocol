import { describe, it, expect } from 'vitest';
import {
  generateOpenApiYaml,
  generateController,
  generateEntity,
  generateRepository,
  generateServiceInterface,
  generateDtos,
  generateTestClass,
  generatePomXml,
  generateBuildGradle,
  generateSettingsGradle,
  generateApplicationYml,
  generateApplicationJava,
} from '../lib/emit/generators.js';

// 간단한 서비스 그룹 — 전형적인 CRUD 형태
const productGroup = {
  service: 'Seller World',
  endpoints: [
    {
      method: 'GET',
      path: '/api/v1/products',
      summary: '상품 목록',
      body: '—',
      response: '200 { items, total, page }',
    },
    {
      method: 'GET',
      path: '/api/v1/products/{id}',
      summary: '상품 조회',
      body: '—',
      response: '200 { id, name, price, createdAt }',
    },
    {
      method: 'POST',
      path: '/api/v1/products',
      summary: '상품 생성',
      body: '{ name, price }',
      response: '201 { id, name }',
    },
    {
      method: 'DELETE',
      path: '/api/v1/products/{id}',
      summary: '상품 삭제',
      body: '—',
      response: '204 No Content',
    },
  ],
};

describe('generateOpenApiYaml', () => {
  it('OpenAPI 3.1 선언과 paths, components를 출력한다', () => {
    const yaml = generateOpenApiYaml([productGroup], 'Commerce');
    expect(yaml).toContain('openapi: "3.1.0"');
    expect(yaml).toContain('title: "Commerce API"');
    expect(yaml).toContain('/api/v1/products');
    // CRUD 모두 등록되어야 한다
    expect(yaml).toContain('get:');
    expect(yaml).toContain('post:');
    expect(yaml).toContain('delete:');
    // POST 바디 스키마 참조
    expect(yaml).toContain('CreateProductRequest');
    // GET 응답 스키마
    expect(yaml).toContain('ProductResponse');
    // 204 No Content
    expect(yaml).toContain('"204"');
  });

  it('여러 그룹의 tags를 중복 없이 나열한다', () => {
    const buyerGroup = {
      service: 'Buyer World',
      endpoints: [
        {
          method: 'POST',
          path: '/api/v1/auth/signup',
          summary: '회원가입',
          body: '{ email, password }',
          response: '201 { id, email }',
        },
      ],
    };
    const yaml = generateOpenApiYaml([productGroup, buyerGroup], 'Commerce');
    expect(yaml).toContain('name: "Seller World"');
    expect(yaml).toContain('name: "Buyer World"');
    // signup는 액션 엔드포인트
    expect(yaml).toContain('SignupRequest');
  });
});

describe('generateController', () => {
  it('REST 컨트롤러 골격과 메서드를 포함한다', () => {
    const code = generateController(productGroup, 'com.forge.app');
    expect(code).toContain('package com.forge.app.sellerworld.controller;');
    expect(code).toContain('@RestController');
    expect(code).toContain('@RequestMapping("/api/v1")');
    expect(code).toContain('public class SellerWorldController');
    expect(code).toContain('@GetMapping("/products/{id}")');
    expect(code).toContain('@PostMapping("/products")');
    expect(code).toContain('@DeleteMapping("/products/{id}")');
    expect(code).toContain('ResponseEntity<Void>');
    expect(code).toContain('noContent()');
  });
});

describe('generateEntity', () => {
  it('JPA @Entity + Lombok + 감사필드를 포함한다 (single-module 기본)', () => {
    const code = generateEntity(productGroup, 'com.forge.app');
    expect(code).toContain('package com.forge.app.sellerworld.entity;');
    expect(code).toContain('@Entity');
    expect(code).toContain('@Table(name = "sellerworlds")');
    expect(code).toContain('import jakarta.persistence.*;');
    expect(code).toContain('private LocalDateTime createdAt;');
    expect(code).toContain('@PrePersist');
    // 응답 필드에서 price를 BigDecimal로 추론
    expect(code).toContain('private BigDecimal price;');
    // BaseEntity 상속하지 않음 (기본값)
    expect(code).not.toContain('extends BaseEntity');
  });

  describe('opts.extendsBaseEntity:true (멀티모듈 emit)', () => {
    const baseEntityCode = generateEntity(productGroup, 'com.forge.app', {
      extendsBaseEntity: true,
    });

    it('class 선언이 extends BaseEntity', () => {
      expect(baseEntityCode).toMatch(/public class SellerWorld extends BaseEntity/);
    });

    it(':core 패키지의 BaseEntity 를 import', () => {
      expect(baseEntityCode).toContain('import com.forge.app.core.entity.BaseEntity;');
    });

    it('id / createdAt / updatedAt 본문 inline 제거', () => {
      expect(baseEntityCode).not.toMatch(/private Long id/);
      expect(baseEntityCode).not.toMatch(/private LocalDateTime createdAt/);
      expect(baseEntityCode).not.toMatch(/private LocalDateTime updatedAt/);
      expect(baseEntityCode).not.toContain('@Id');
      expect(baseEntityCode).not.toContain('@GeneratedValue');
    });

    it('@PrePersist / @PreUpdate 콜백 제거 (BaseEntity 가 처리)', () => {
      expect(baseEntityCode).not.toContain('@PrePersist');
      expect(baseEntityCode).not.toContain('@PreUpdate');
      expect(baseEntityCode).not.toContain('protected void onCreate');
      expect(baseEntityCode).not.toContain('protected void onUpdate');
    });

    it('도메인 필드는 그대로 유지 (price = BigDecimal 추론)', () => {
      expect(baseEntityCode).toContain('private BigDecimal price;');
      expect(baseEntityCode).toContain('private String name;');
    });

    it('도메인에 LocalDateTime 필드가 없으면 import 도 생략', () => {
      // productGroup 의 GET /{id} 응답이 createdAt 을 포함 → inferEntityFields 결과에 들어옴
      // → extendsBaseEntity 에서 createdAt 필드가 제거되므로 LocalDateTime 도 불필요
      expect(baseEntityCode).not.toContain('import java.time.LocalDateTime');
    });

    it('basePackage 변경 시 BaseEntity import 도 따라감', () => {
      const out = generateEntity(productGroup, 'com.acme.shop', { extendsBaseEntity: true });
      expect(out).toContain('import com.acme.shop.core.entity.BaseEntity;');
      expect(out).toContain('package com.acme.shop.sellerworld.entity;');
    });

    it('@Entity / @Table / Lombok 어노테이션은 그대로 유지', () => {
      expect(baseEntityCode).toContain('@Entity');
      expect(baseEntityCode).toContain('@Table(name = "sellerworlds")');
      expect(baseEntityCode).toContain('@Getter');
      expect(baseEntityCode).toContain('@Setter');
      expect(baseEntityCode).toContain('@Builder');
    });
  });
});

describe('generateRepository', () => {
  it('JpaRepository 인터페이스 선언을 만든다', () => {
    const code = generateRepository(productGroup, 'com.forge.app');
    expect(code).toContain('package com.forge.app.sellerworld.repository;');
    expect(code).toContain('extends JpaRepository<SellerWorld, Long>');
  });
});

describe('generateServiceInterface', () => {
  it('엔드포인트별 메서드 시그니처를 선언한다', () => {
    const code = generateServiceInterface(productGroup, 'com.forge.app');
    expect(code).toContain('public interface SellerWorldService');
    expect(code).toContain('ProductListResponse listProducts()');
    expect(code).toContain('ProductResponse getProduct(Long id)');
    expect(code).toContain('CreateProductRequest request');
    expect(code).toContain('void deleteProduct(Long id)');
  });
});

describe('generateDtos', () => {
  it('request/response 필드를 Java record로 출력한다', () => {
    const dtos = generateDtos(productGroup, 'com.forge.app');
    const names = dtos.map((d) => d.name);
    expect(names).toContain('CreateProductRequest');
    expect(names).toContain('ProductResponse');
    const create = dtos.find((d) => d.name === 'CreateProductRequest');
    expect(create.content).toContain('public record CreateProductRequest(');
    expect(create.content).toContain('BigDecimal price');
    const product = dtos.find((d) => d.name === 'ProductResponse');
    expect(product.content).toContain('LocalDateTime createdAt');
  });
});

describe('generateTestClass', () => {
  it('JUnit5 + MockMvc 스캐폴딩을 생성한다', () => {
    const scenario = {
      blockId: 'product-register',
      block: '상품 등록',
      tests: [
        {
          name: '정상 등록',
          given: '유효한 입력',
          when: 'POST /products',
          then: '201 반환',
          type: 'happy-path',
        },
        {
          name: '잘못된 입력',
          given: '필수값 누락',
          when: 'POST /products',
          then: '400 반환',
          type: 'edge-case',
        },
      ],
    };
    const code = generateTestClass(scenario, 'com.forge.app');
    expect(code).toContain('@SpringBootTest');
    expect(code).toContain('@AutoConfigureMockMvc');
    expect(code).toContain('class ProductRegisterTest');
    expect(code).toContain('void happyPath1()');
    expect(code).toContain('void edgeCase1()');
    expect(code).toContain('@DisplayName("정상 등록")');
  });
});

describe('generateBuildGradle / generateSettingsGradle', () => {
  it('build.gradle은 spring-boot/jpa/h2/lombok 의존성을 선언한다', () => {
    const gradle = generateBuildGradle('com.forge.app', 'forge-app');
    expect(gradle).toContain(`id 'org.springframework.boot'`);
    expect(gradle).toContain(`id 'io.spring.dependency-management'`);
    expect(gradle).toContain(`implementation 'org.springframework.boot:spring-boot-starter-web'`);
    expect(gradle).toContain(`implementation 'org.springframework.boot:spring-boot-starter-data-jpa'`);
    expect(gradle).toContain(`runtimeOnly 'com.h2database:h2'`);
    expect(gradle).toContain(`annotationProcessor 'org.projectlombok:lombok'`);
    expect(gradle).toContain(`useJUnitPlatform()`);
    expect(gradle).toContain(`mainClass = 'com.forge.app.Application'`);
    expect(gradle).toContain(`JavaVersion.VERSION_17`);
  });

  it('settings.gradle은 rootProject.name 선언만 남긴다', () => {
    const settings = generateSettingsGradle('forge-app');
    expect(settings.trim()).toBe(`rootProject.name = 'forge-app'`);
  });
});

describe('generatePomXml / generateApplicationYml / generateApplicationJava', () => {
  it('pom.xml은 spring-boot-starter 의존성을 포함한다', () => {
    const pom = generatePomXml('com.forge.app', 'forge-app');
    expect(pom).toContain('<artifactId>spring-boot-starter-web</artifactId>');
    expect(pom).toContain('<artifactId>spring-boot-starter-data-jpa</artifactId>');
    expect(pom).toContain('<artifactId>h2</artifactId>');
    expect(pom).toContain('<artifactId>forge-app</artifactId>');
  });

  it('application.yml은 H2 파일 DB 설정을 기본값으로 쓴다', () => {
    const yml = generateApplicationYml('forge-app');
    expect(yml).toContain('jdbc:h2:file:./data/forge-app');
    expect(yml).toContain('ddl-auto: update');
    expect(yml).toContain('swagger-ui');
  });

  it('Application.java는 @SpringBootApplication 진입점을 만든다', () => {
    const java = generateApplicationJava('com.forge.app');
    expect(java).toContain('package com.forge.app;');
    expect(java).toContain('@SpringBootApplication');
    expect(java).toContain('SpringApplication.run(Application.class, args);');
  });
});
